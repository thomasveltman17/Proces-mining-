/**
 * Activity abstraction: turns raw browser interaction events into a
 * process-mining-ready activity log (case id, activity name, timestamp).
 *
 * Raw event types emitted by the tracker:
 *   nav        → user navigated to a page/route
 *   click      → user clicked a semantic element
 *   input      → user finished a typing burst in one field (values masked)
 *   submit     → user submitted a form
 *   rage_click / dead_click → friction markers (not activities)
 *   session_end → tab closed / session over (not an activity)
 */

const FRICTION_TYPES = new Set(['rage_click', 'dead_click']);
const IGNORED_TYPES = new Set(['session_end', 'visibility']);

export function activityName(event) {
  const label = (event.label ?? '').trim();
  switch (event.type) {
    case 'nav':
      return label ? `View ${label}` : 'View page';
    case 'click':
      // Elements annotated with data-flowlens carry an exact activity name.
      return label || 'Click (unlabeled)';
    case 'input':
      return label ? `Fill "${label}"` : 'Fill field';
    case 'submit':
      return label ? `Submit ${label}` : 'Submit form';
    default:
      return null;
  }
}

/**
 * Groups raw events into cases and abstracts them into activities.
 * A "case" is the unit the process runs on (e.g., one invoice).
 *
 * Case attribution: events that carry no case id yet (e.g., browsing the
 * inbox before opening an invoice) are attributed *forward* to the next
 * case seen in the same session — clicking "Open invoice" belongs to the
 * invoice it opens. Trailing case-less events stick to the last case, and
 * sessions that never see a case fall back to a per-session case so
 * mining still works on uninstrumented apps.
 *
 * Returns: Map<caseKey, {caseId, sessionIds:Set, activities:[{name, ts, endTs, repeat, sessionId}]}>
 */
export function buildCases(rawEvents) {
  // Order events per session, then resolve each event's effective case.
  const bySession = new Map();
  for (const e of rawEvents) {
    if (FRICTION_TYPES.has(e.type) || IGNORED_TYPES.has(e.type)) continue;
    if (!activityName(e)) continue;
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }

  const resolved = []; // {event, caseKey}
  for (const [sessionId, events] of bySession) {
    events.sort((a, b) => a.ts - b.ts || a.id - b.id);
    const pending = [];
    let lastCase = null;
    for (const e of events) {
      if (e.case_id) {
        for (const p of pending) resolved.push({ event: p, caseKey: e.case_id });
        pending.length = 0;
        lastCase = e.case_id;
        resolved.push({ event: e, caseKey: e.case_id });
      } else {
        pending.push(e);
      }
    }
    const fallback = lastCase ?? `session:${sessionId}`;
    for (const p of pending) resolved.push({ event: p, caseKey: fallback });
  }
  resolved.sort((a, b) => a.event.ts - b.event.ts || a.event.id - b.event.id);

  const cases = new Map();
  for (const { event: e, caseKey } of resolved) {
    let c = cases.get(caseKey);
    if (!c) {
      c = { caseId: caseKey, sessionIds: new Set(), activities: [] };
      cases.set(caseKey, c);
    }
    c.sessionIds.add(e.session_id);

    const name = activityName(e);
    const endTs = e.ts + (e.duration_ms ?? 0);
    const prev = c.activities[c.activities.length - 1];
    if (prev && prev.name === name) {
      // Collapse consecutive repeats (e.g., re-clicking the same button).
      prev.repeat += 1;
      prev.endTs = Math.max(prev.endTs, endTs);
    } else {
      c.activities.push({ name, ts: e.ts, endTs, repeat: 1, sessionId: e.session_id });
    }
  }

  return cases;
}

/** Friction marker events, kept separate from the activity log. */
export function frictionEvents(rawEvents) {
  return rawEvents.filter((e) => FRICTION_TYPES.has(e.type));
}
