/**
 * Episode segmentation.
 *
 * A passive capture stream is one long, un-delimited sequence of interactions
 * across many apps. Before we can mine processes we must cut it into TASK
 * EPISODES — candidate single runs of some (unknown) process. We cut on:
 *   - idle gaps (the user stepped away / switched tasks), and
 *   - a maximum episode span (a safety cap so one marathon session isn't one case).
 *
 * Segmentation is per capture stream (session = one user's device stream).
 */

const IDLE_GAP_MS = 3 * 60 * 1000; // > 3 min gap ends an episode
const MAX_SPAN_MS = 30 * 60 * 1000; // hard cap on episode length
const MIN_EVENTS = 2; // drop trivial fragments

/**
 * @param {Array} events raw events for ONE session, any order
 * @returns {Array<{id, sessionId, events: Array, apps: Set, startTs, endTs}>}
 */
export function segmentEpisodes(events) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts || a.id - b.id);
  const episodes = [];
  let cur = null;

  const flush = () => {
    if (cur && cur.events.length >= MIN_EVENTS) episodes.push(cur);
    cur = null;
  };

  for (const e of sorted) {
    if (e.type === 'session_end' || e.type === 'visibility') {
      // treat an explicit end as a boundary but not an activity
      flush();
      continue;
    }
    if (cur) {
      const gap = e.ts - cur.endTs;
      const span = e.ts - cur.startTs;
      if (gap > IDLE_GAP_MS || span > MAX_SPAN_MS) flush();
    }
    if (!cur) {
      cur = {
        id: `${e.session_id}:${e.ts}`,
        sessionId: e.session_id,
        events: [],
        apps: new Set(),
        startTs: e.ts,
        endTs: e.ts,
      };
    }
    cur.events.push(e);
    if (e.app) cur.apps.add(e.app);
    cur.endTs = Math.max(cur.endTs, e.ts + (e.duration_ms ?? 0));
  }
  flush();
  return episodes;
}
