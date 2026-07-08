/**
 * Discovery pipeline orchestrator.
 *
 * raw events → episodes → stitched cross-app cases → normalized activities →
 * clustered & named processes. Output cases are shaped exactly like the
 * existing buildCases() output, so mining.js / friction.js run on them unchanged.
 *
 * Results are cached and invalidated when the underlying event count changes
 * (same recompute-on-ingest model the browser path uses).
 */

import { allEvents, allSessions } from '../db.js';
import { segmentEpisodes } from './segment.js';
import { stitchCases } from './entities.js';
import { activitiesForCases } from './label.js';
import { clusterProcesses } from './cluster.js';

let _cache = null;
let _cacheKey = null;

function cacheKey() {
  const events = allEvents();
  return `${events.length}`;
}

/**
 * Runs the full pipeline. Returns:
 *   { cases: Map<caseId, case>, processes: [...], caseIndex: Map<caseId, {case, processId}> }
 */
export async function discover() {
  const key = cacheKey();
  if (_cache && _cacheKey === key) return _cache;

  const events = allEvents();

  // 1. segment each capture stream (session) into episodes
  const bySession = new Map();
  for (const e of events) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }
  let episodes = [];
  for (const evs of bySession.values()) episodes = episodes.concat(segmentEpisodes(evs));

  // 2. stitch episodes into cross-app cases via shared entities
  const cases = await stitchCases(episodes);

  // 3. normalize activities per case (miner-shaped output)
  const casesMap = await activitiesForCases(cases);

  // 4. cluster cases into named processes
  const processes = await clusterProcesses(casesMap);

  // index: caseId -> processId
  const caseToProcess = new Map();
  for (const p of processes) for (const cid of p.caseIds) caseToProcess.set(cid, p.id);

  _cache = { cases: casesMap, processes, caseToProcess, meta: { episodes: episodes.length } };
  _cacheKey = key;
  return _cache;
}

/** Cross-app timeline for one stitched case, with app + source badges. */
export function caseTimeline(caseObj) {
  return caseObj.activities.map((a) => ({
    activity: a.name,
    app: a.app,
    ts: a.ts,
    endTs: a.endTs,
    repeat: a.repeat,
  }));
}

/** Which capture sources are feeding the system (for the dashboard indicator). */
export function activeSources() {
  const events = allEvents();
  const sources = new Map();
  for (const e of events) {
    const s = e.source ?? 'browser';
    sources.set(s, (sources.get(s) ?? 0) + 1);
  }
  return [...sources.entries()].map(([source, events]) => ({ source, events }));
}

export function sessionCount() {
  return allSessions().length;
}
