/**
 * Process discovery over the abstracted activity log:
 *  - directly-follows graph (DFG) with per-edge frequency and median duration
 *  - variant analysis (distinct activity sequences, ranked by case count)
 */

export const START = '__start__';
export const END = '__end__';

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Builds the DFG. Returns:
 *   nodes: [{id, count, caseCount, medianDwellMs}]
 *   edges: [{from, to, count, caseCount, medianMs}]
 * Includes artificial START/END nodes so entry/exit points are visible.
 */
export function discoverProcessMap(cases) {
  const nodeStats = new Map(); // name -> {count, cases:Set, dwell:[]}
  const edgeStats = new Map(); // "a→b" -> {from, to, count, cases:Set, durations:[]}

  const touchNode = (name) => {
    let n = nodeStats.get(name);
    if (!n) nodeStats.set(name, (n = { count: 0, cases: new Set(), dwell: [] }));
    return n;
  };
  const touchEdge = (from, to) => {
    const key = `${from}→${to}`;
    let e = edgeStats.get(key);
    if (!e) edgeStats.set(key, (e = { from, to, count: 0, cases: new Set(), durations: [] }));
    return e;
  };

  for (const c of cases.values()) {
    const acts = c.activities;
    if (acts.length === 0) continue;

    const startEdge = touchEdge(START, acts[0].name);
    startEdge.count += 1;
    startEdge.cases.add(c.caseId);

    for (let i = 0; i < acts.length; i++) {
      const node = touchNode(acts[i].name);
      node.count += acts[i].repeat;
      node.cases.add(c.caseId);
      node.dwell.push(Math.max(0, acts[i].endTs - acts[i].ts));

      if (i + 1 < acts.length) {
        const edge = touchEdge(acts[i].name, acts[i + 1].name);
        edge.count += 1;
        edge.cases.add(c.caseId);
        edge.durations.push(Math.max(0, acts[i + 1].ts - acts[i].endTs));
      }
    }

    const endEdge = touchEdge(acts[acts.length - 1].name, END);
    endEdge.count += 1;
    endEdge.cases.add(c.caseId);
  }

  const nodes = [
    { id: START, count: cases.size, caseCount: cases.size, medianDwellMs: 0 },
    { id: END, count: cases.size, caseCount: cases.size, medianDwellMs: 0 },
    ...[...nodeStats.entries()].map(([id, s]) => ({
      id,
      count: s.count,
      caseCount: s.cases.size,
      medianDwellMs: median(s.dwell),
    })),
  ];

  const edges = [...edgeStats.values()].map((e) => ({
    from: e.from,
    to: e.to,
    count: e.count,
    caseCount: e.cases.size,
    medianMs: median(e.durations),
  }));

  return { nodes, edges };
}

/**
 * Variants: distinct end-to-end activity sequences across cases.
 * Returns ranked [{id, activities, count, share, medianDurationMs, caseIds}].
 */
export function discoverVariants(cases) {
  const variants = new Map();
  let total = 0;

  for (const c of cases.values()) {
    if (c.activities.length === 0) continue;
    total += 1;
    const seq = c.activities.map((a) => a.name);
    const key = seq.join('');
    let v = variants.get(key);
    if (!v) variants.set(key, (v = { activities: seq, count: 0, durations: [], caseIds: [] }));
    v.count += 1;
    v.caseIds.push(c.caseId);
    const first = c.activities[0];
    const last = c.activities[c.activities.length - 1];
    v.durations.push(Math.max(0, last.endTs - first.ts));
  }

  return [...variants.values()]
    .sort((a, b) => b.count - a.count)
    .map((v, i) => ({
      id: `V${i + 1}`,
      activities: v.activities,
      count: v.count,
      share: total ? v.count / total : 0,
      medianDurationMs: median(v.durations),
      caseIds: v.caseIds,
    }));
}

/**
 * End activities: activities that commonly terminate a case (≥ share of cases).
 * Used by friction detection to spot abandoned cases.
 */
export function commonEndActivities(cases, minShare = 0.15) {
  const lastCounts = new Map();
  let total = 0;
  for (const c of cases.values()) {
    if (c.activities.length === 0) continue;
    total += 1;
    const last = c.activities[c.activities.length - 1].name;
    lastCounts.set(last, (lastCounts.get(last) ?? 0) + 1);
  }
  const ends = new Set();
  for (const [name, count] of lastCounts) {
    if (count / total >= minShare) ends.add(name);
  }
  return ends;
}

export { median };
