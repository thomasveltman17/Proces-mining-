/**
 * Simulated cross-app desktop feed.
 *
 * Emulates what the passive desktop agent (accessibility + vision) would emit:
 * a continuous, un-annotated stream of interactions across Outlook, a PDF
 * viewer, Excel, a calendar, and web apps (ERP/CRM), for several users over a
 * workday. Runs of different business processes are interleaved and carry the
 * shared identifiers (INV-…, EXP-…, CUS-…) that let the discovery engine
 * STITCH cross-app cases — with NO caseId set on any event, exactly as a real
 * passive capture stream would look.
 *
 * Emitted through the same ingest path as every other source.
 */
import { db, ingestBatch } from '../server/src/db.js';

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(7);
const between = (a, b) => a + rand() * (b - a);

// One event helper — desktop (accessibility) or web (browser) source.
function ev(type, label, app, source, windowTitle) {
  return { type, label, app, source, windowTitle };
}

const AX = 'desktop_ax';
const WEB = 'browser';

/** Process templates: each returns an ordered list of cross-app steps for one case. */
const TEMPLATES = {
  invoice(id, vendor) {
    return [
      ev('open', `Open email: Invoice ${id} from ${vendor}`, 'Outlook', AX, `Inbox — ${vendor}`),
      ev('click', `Open attachment ${id}.pdf`, 'Outlook', AX, `Inbox — ${vendor}`),
      ev('nav', `View invoice PDF ${id}`, 'PDF Viewer', AX, `${id}.pdf`),
      ev('nav', `Open ledger`, 'Excel', AX, `Ledger.xlsx`),
      ev('input', `Enter amount for ${id}`, 'Excel', AX, `Ledger.xlsx`),
      ev('save', `Save ledger`, 'Excel', AX, `Ledger.xlsx`),
      ev('nav', `Open invoice ${id}`, 'erp.acme.com', WEB, `ERP — Invoice ${id}`),
      ev('click', `Approve invoice ${id}`, 'erp.acme.com', WEB, `ERP — Invoice ${id}`),
      ev('send', `Reply approved re: ${id}`, 'Outlook', AX, `Inbox — ${vendor}`),
    ];
  },
  expense(id, who) {
    return [
      ev('open', `Open email: Expense ${id} from ${who}`, 'Outlook', AX, `Inbox — ${who}`),
      ev('nav', `Open expense ${id}`, 'erp.acme.com', WEB, `ERP — Expense ${id}`),
      ev('click', `Review receipt ${id}`, 'erp.acme.com', WEB, `ERP — Expense ${id}`),
      ev('click', `Approve expense ${id}`, 'erp.acme.com', WEB, `ERP — Expense ${id}`),
      ev('nav', `Open expense tracker`, 'Excel', AX, `Expenses.xlsx`),
      ev('input', `Log expense ${id}`, 'Excel', AX, `Expenses.xlsx`),
    ];
  },
  onboarding(id, name) {
    return [
      ev('nav', `Open CRM`, 'crm.acme.com', WEB, `CRM`),
      ev('input', `Create customer ${id} (${name})`, 'crm.acme.com', WEB, `CRM — New customer`),
      ev('nav', `Open customer master`, 'Excel', AX, `Customers.xlsx`),
      ev('input', `Add ${id} to master sheet`, 'Excel', AX, `Customers.xlsx`),
      ev('send', `Send welcome email to ${name}`, 'Outlook', AX, `Compose — Welcome`),
      ev('open', `Schedule kickoff for ${id}`, 'Calendar', AX, `Calendar — New event`),
    ];
  },
};

const VENDORS = ['Nordic Supplies', 'CloudMetrics', 'Falcon Logistics', 'GreenGrid', 'PixelPeach'];
const PEOPLE = ['J. Klaas', 'M. de Vries', 'S. Bakker', 'R. Jansen'];
const NAMES = ['Acme Retail', 'BlueOcean BV', 'Meridian Co', 'Zephyr Ltd', 'Halcyon Group'];

// Build the mix of process runs.
const runs = [];
let inv = 2000;
let exp = 3000;
let cus = 4000;
for (let i = 0; i < 16; i++) runs.push({ kind: 'invoice', id: `INV-${++inv}`, party: VENDORS[i % VENDORS.length] });
for (let i = 0; i < 10; i++) runs.push({ kind: 'expense', id: `EXP-${++exp}`, party: PEOPLE[i % PEOPLE.length] });
for (let i = 0; i < 8; i++) runs.push({ kind: 'onboarding', id: `CUS-${++cus}`, party: NAMES[i % NAMES.length] });

// A few invoices get revisited later in a SEPARATE episode → tests cross-episode stitching.
const revisits = runs.filter((r) => r.kind === 'invoice').slice(0, 4);

// Deterministic shuffle so processes interleave across the day.
for (let i = runs.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [runs[i], runs[j]] = [runs[j], runs[i]];
}

const USERS = ['anna', 'ben', 'carla'];
const now = Date.now();

db.exec("DELETE FROM raw_events WHERE source IN ('desktop_ax','desktop_vision') OR app LIKE '%acme.com'");
db.exec("DELETE FROM sessions WHERE id LIKE 'device_%'");

// Distribute runs round-robin to users; within a user, separate runs by idle gaps.
const perUser = new Map(USERS.map((u) => [u, []]));
runs.forEach((r, i) => perUser.get(USERS[i % USERS.length]).push(r));
revisits.forEach((r, i) => perUser.get(USERS[i % USERS.length]).push({ ...r, revisit: true }));

for (const user of USERS) {
  const events = [];
  let t = now - 8 * 3600 * 1000 + Math.round(between(0, 1800_000)); // start ~8h ago
  const userRuns = perUser.get(user);

  for (const run of userRuns) {
    let steps;
    if (run.revisit) {
      // a short follow-up episode referencing the same invoice
      steps = [
        ev('nav', `Open invoice ${run.id}`, 'erp.acme.com', WEB, `ERP — Invoice ${run.id}`),
        ev('click', `Add note to ${run.id}`, 'erp.acme.com', WEB, `ERP — Invoice ${run.id}`),
      ];
    } else {
      steps = TEMPLATES[run.kind](run.id, run.party);
    }
    for (const s of steps) {
      events.push({ ...s, ts: t, durationMs: Math.round(between(500, 4000)) });
      t += Math.round(between(2000, 12000)); // seconds between steps within a run
    }
    t += Math.round(between(5, 40) * 60 * 1000); // idle gap between runs → episode boundary
  }

  ingestBatch(
    {
      id: `device_${user}`,
      app: `workstation-${user}`,
      source: 'desktop_ax',
      startedAt: events[0].ts,
      lastSeenAt: t,
      userAgent: `desktop-agent/${user}`,
    },
    events
  );
}

const total = db
  .prepare("SELECT COUNT(*) n FROM raw_events WHERE source='desktop_ax' OR app LIKE '%acme.com'")
  .get().n;
console.log(`Seeded ${runs.length} process runs (+${revisits.length} revisits) across ${USERS.length} device streams — ${total} cross-app events.`);
