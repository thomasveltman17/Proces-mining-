/**
 * Activity normalization for cross-app cases.
 *
 * Turns each stitched case into an ordered list of canonical activities (with
 * their app + timing), collapsing consecutive repeats. This generalizes the
 * browser-only abstraction layer to any source, and feeds the existing miner.
 */

import { normalizeActivities } from '../ai.js';

/**
 * @param cases stitched cross-app cases (from entities.js)
 * @returns Map<caseId, { caseId, apps:Set, sessionIds:Set, activities:[{name, app, ts, endTs, repeat}] }>
 *          shaped exactly like the existing buildCases() output so mining.js reuses it.
 */
export async function activitiesForCases(cases) {
  // Gather every raw event across all cases so one AI pass normalizes them all.
  const allEvents = [];
  for (const c of cases) for (const ep of c.episodes) allEvents.push(...ep.events);
  const nameByKey = await normalizeActivities(allEvents);
  const keyOf = (e) => `${e.type}|${e.app ?? ''}|${(e.label ?? '').trim()}`;

  const out = new Map();
  for (const c of cases) {
    const events = c.episodes
      .flatMap((ep) => ep.events)
      .filter((e) => e.type !== 'session_end' && e.type !== 'visibility')
      .sort((a, b) => a.ts - b.ts || a.id - b.id);

    const activities = [];
    for (const e of events) {
      const name = nameByKey.get(keyOf(e)) ?? e.label ?? e.type;
      const endTs = e.ts + (e.duration_ms ?? 0);
      const prev = activities[activities.length - 1];
      if (prev && prev.name === name && prev.app === (e.app ?? null)) {
        prev.repeat += 1;
        prev.endTs = Math.max(prev.endTs, endTs);
      } else {
        activities.push({ name, app: e.app ?? null, ts: e.ts, endTs, repeat: 1 });
      }
    }
    if (activities.length === 0) continue;
    out.set(c.id, {
      caseId: c.id,
      entity: c.entity,
      apps: c.apps,
      sessionIds: c.sessionIds,
      activities,
    });
  }
  return out;
}
