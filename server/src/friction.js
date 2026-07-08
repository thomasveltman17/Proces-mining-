/**
 * Friction detection — the layer log-based process mining cannot see.
 * Works on both explicit client-side friction markers (rage/dead clicks)
 * and patterns mined from the activity log (loops, slow steps, abandonment).
 */

import { frictionEvents } from './abstraction.js';
import { commonEndActivities, discoverProcessMap, median } from './mining.js';

export function analyzeFriction(rawEvents, cases) {
  const issues = [];

  // 1. Rage & dead clicks, aggregated by target element.
  const markers = frictionEvents(rawEvents);
  const byTarget = new Map();
  for (const m of markers) {
    const key = `${m.type}|${m.label ?? m.selector ?? 'unknown'}`;
    let t = byTarget.get(key);
    if (!t) byTarget.set(key, (t = { type: m.type, target: m.label ?? m.selector ?? 'unknown', count: 0, sessions: new Set(), pages: new Set() }));
    t.count += 1;
    t.sessions.add(m.session_id);
    if (m.page) t.pages.add(m.page);
  }
  for (const t of byTarget.values()) {
    issues.push({
      kind: t.type, // 'rage_click' | 'dead_click'
      title:
        t.type === 'rage_click'
          ? `Rage clicks on "${t.target}"`
          : `Dead clicks on "${t.target}"`,
      detail:
        t.type === 'rage_click'
          ? `Users repeatedly hammered "${t.target}" — it likely looks clickable but doesn't respond the way they expect.`
          : `Clicks on "${t.target}" produced no visible reaction.`,
      occurrences: t.count,
      affectedSessions: [...t.sessions],
      pages: [...t.pages],
      severity: t.sessions.size >= 5 ? 'high' : t.sessions.size >= 2 ? 'medium' : 'low',
    });
  }

  // 2. Backtracking loops: A→B→A patterns in activity sequences.
  const loops = new Map();
  for (const c of cases.values()) {
    const names = c.activities.map((a) => a.name);
    for (let i = 0; i + 2 < names.length; i++) {
      if (names[i] === names[i + 2] && names[i] !== names[i + 1]) {
        const key = `${names[i]}⇄${names[i + 1]}`;
        let l = loops.get(key);
        if (!l) loops.set(key, (l = { a: names[i], b: names[i + 1], count: 0, cases: new Set() }));
        l.count += 1;
        l.cases.add(c.caseId);
      }
    }
  }
  for (const l of loops.values()) {
    if (l.count < 2) continue;
    issues.push({
      kind: 'backtrack_loop',
      title: `Ping-pong between "${l.a}" and "${l.b}"`,
      detail: `Users bounce back and forth (${l.a} → ${l.b} → ${l.a}) ${l.count}×, suggesting missing information or an unclear step.`,
      occurrences: l.count,
      affectedSessions: [...l.cases],
      severity: l.cases.size >= 5 ? 'high' : l.cases.size >= 2 ? 'medium' : 'low',
    });
  }

  // 3. Slow transitions: edges whose median duration stands out.
  const { edges } = discoverProcessMap(cases);
  const realEdges = edges.filter((e) => !e.from.startsWith('__') && !e.to.startsWith('__') && e.count >= 3);
  const overallMedian = median(realEdges.map((e) => e.medianMs));
  for (const e of realEdges) {
    if (e.medianMs > Math.max(10_000, overallMedian * 3)) {
      issues.push({
        kind: 'slow_step',
        title: `Slow transition: "${e.from}" → "${e.to}"`,
        detail: `Median ${(e.medianMs / 1000).toFixed(1)}s to move on (process median is ${(overallMedian / 1000).toFixed(1)}s) — users hesitate or search here.`,
        occurrences: e.count,
        affectedSessions: [],
        severity: e.medianMs > overallMedian * 6 ? 'high' : 'medium',
        medianMs: e.medianMs,
      });
    }
  }

  // 4. Abandonment: cases that never reach a common end activity.
  const ends = commonEndActivities(cases);
  if (ends.size > 0) {
    const abandoned = [];
    for (const c of cases.values()) {
      if (c.activities.length === 0) continue;
      const last = c.activities[c.activities.length - 1].name;
      if (!ends.has(last)) abandoned.push({ caseId: c.caseId, lastActivity: last });
    }
    if (abandoned.length > 0) {
      const byLast = new Map();
      for (const a of abandoned) byLast.set(a.lastActivity, (byLast.get(a.lastActivity) ?? 0) + 1);
      const topExit = [...byLast.entries()].sort((x, y) => y[1] - x[1])[0];
      issues.push({
        kind: 'abandonment',
        title: `${abandoned.length} of ${cases.size} cases abandoned mid-process`,
        detail: `These cases never reached a normal end point. Most common drop-off: after "${topExit[0]}" (${topExit[1]} cases).`,
        occurrences: abandoned.length,
        affectedSessions: abandoned.map((a) => a.caseId),
        severity: abandoned.length / cases.size > 0.2 ? 'high' : 'medium',
      });
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return issues.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.occurrences - a.occurrences
  );
}
