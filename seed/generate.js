/**
 * Seed generator — simulates realistic invoice-approval sessions and writes
 * them through the same ingest code path the tracker uses, so the dashboard
 * is populated on first run.
 *
 * Deterministic (seeded RNG) so repeated runs produce the same dataset.
 */
import { db, ingestBatch } from '../server/src/db.js';

// Deterministic RNG (mulberry32)
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const between = (min, max) => min + rand() * (max - min);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const VENDOR_HINT = ['ops', 'finance', 'procurement'];

/** Builds one session's raw event stream for one invoice case. */
function buildSession({ sessionId, caseId, startTs, variant }) {
  const events = [];
  let t = startTs;
  const step = (minS, maxS) => (t += Math.round(between(minS * 1000, maxS * 1000)));

  const nav = (page, caseIdHere) =>
    events.push({ type: 'nav', label: page, page, ts: t, caseId: caseIdHere ?? null });
  const click = (label, caseIdHere, selector) =>
    events.push({ type: 'click', label, selector: selector ?? 'button', ts: t, caseId: caseIdHere ?? null, page: 'Invoice detail' });

  // Everyone starts in the inbox and opens the invoice.
  nav('Inbox', null);
  step(2, 8);
  click('Open invoice', null, 'tr.row-invoice');
  step(0.3, 0.8);
  nav('Invoice detail', caseId);
  step(3, 12); // reading the invoice

  const finishApproval = () => {
    click('Verify line items', caseId, 'input#verify');
    step(0.8, 2.5);
    click('Approve invoice', caseId, 'button#approve');
    step(0.3, 0.8);
    nav('Confirmation', caseId);
    step(1, 4);
    click('Back to inbox', caseId, 'button.primary');
    step(0.3, 0.8);
    nav('Inbox', null);
  };

  switch (variant) {
    case 'happy_approve':
      finishApproval();
      break;

    case 'approve_with_pdf':
      click('View PDF', caseId, 'button#pdf-btn');
      step(5, 20); // studying the PDF
      finishApproval();
      break;

    case 'rage_approve': {
      // Tries to approve without the checkbox → button silently refuses.
      click('Approve invoice', caseId, 'button#approve');
      t += Math.round(between(250, 450));
      click('Approve invoice', caseId, 'button#approve');
      t += Math.round(between(250, 450));
      click('Approve invoice', caseId, 'button#approve');
      events.push({ type: 'rage_click', label: 'Approve invoice', selector: 'button#approve', ts: t, caseId, page: 'Invoice detail' });
      step(4, 10); // hunting for why it doesn't work
      finishApproval();
      break;
    }

    case 'reject': {
      click('Reject invoice', caseId, 'button#reject');
      step(1, 3);
      const typing = Math.round(between(6000, 25000));
      events.push({
        type: 'input',
        label: 'Rejection reason',
        selector: 'textarea#reason',
        valueLen: Math.round(between(30, 160)),
        durationMs: typing,
        ts: t,
        caseId,
        page: 'Invoice detail',
      });
      t += typing;
      step(0.5, 2);
      click('Confirm rejection', caseId, 'button#confirm-reject');
      step(0.3, 0.8);
      nav('Confirmation', caseId);
      step(1, 3);
      click('Back to inbox', caseId, 'button.primary');
      step(0.3, 0.8);
      nav('Inbox', null);
      break;
    }

    case 'ping_pong': {
      // Goes back to the inbox to double-check something, then returns.
      click('Back to inbox', caseId, 'a.back');
      step(0.3, 0.8);
      nav('Inbox', caseId); // still attributed to the case they're working on
      step(3, 10);
      click('Open invoice', caseId, 'tr.row-invoice');
      step(0.3, 0.8);
      nav('Invoice detail', caseId);
      step(2, 8);
      finishApproval();
      break;
    }

    case 'abandoned':
      click('View PDF', caseId, 'button#pdf-btn');
      step(8, 30);
      events.push({ type: 'session_end', ts: t, caseId });
      break;
  }

  return {
    session: {
      id: sessionId,
      app: 'invoice-approval',
      startedAt: startTs,
      lastSeenAt: t,
      userAgent: `seed/${pick(VENDOR_HINT)}`,
    },
    events,
  };
}

// Variant mix roughly matching a real back-office tool.
const MIX = [
  ['happy_approve', 22],
  ['approve_with_pdf', 14],
  ['rage_approve', 9],
  ['reject', 7],
  ['ping_pong', 5],
  ['abandoned', 5],
];

const now = Date.now();
const spanDays = 7;
let sessionNo = 0;
let invoiceNo = 2000;

db.exec('DELETE FROM raw_events; DELETE FROM sessions;');

for (const [variant, count] of MIX) {
  for (let i = 0; i < count; i++) {
    sessionNo += 1;
    invoiceNo += 1;
    const startTs = now - Math.round(between(0, spanDays * 24 * 3600 * 1000));
    const { session, events } = buildSession({
      sessionId: `seed_${String(sessionNo).padStart(3, '0')}`,
      caseId: `INV-${invoiceNo}`,
      startTs,
      variant,
    });
    ingestBatch(session, events);
  }
}

const totals = {
  sessions: db.prepare('SELECT COUNT(*) n FROM sessions').get().n,
  events: db.prepare('SELECT COUNT(*) n FROM raw_events').get().n,
};
console.log(`Seeded ${totals.sessions} sessions with ${totals.events} raw events.`);
