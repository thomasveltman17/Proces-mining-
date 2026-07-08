/**
 * Process clustering + naming.
 *
 * Cases that follow a similar activity pattern are runs of the SAME process.
 * We cluster cases by activity-set similarity (Jaccard) with single-linkage
 * agglomeration above a threshold, then name each cluster via the AI layer.
 * Each resulting cluster is a "discovered process".
 */

import { nameProcess } from '../ai.js';

const SIMILARITY = 0.5; // min Jaccard to join a cluster

function activitySet(caseObj) {
  return new Set(caseObj.activities.map((a) => a.name));
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * @param casesMap Map<caseId, case> from label.js
 * @returns Array<{ id, name, description, caseIds:[], apps:[], sequences:[[{name,app}]] }>
 */
export async function clusterProcesses(casesMap) {
  const cases = [...casesMap.values()];
  const sets = cases.map(activitySet);
  const clusterOf = cases.map(() => -1);
  const clusters = []; // each: { members:[idx] }

  for (let i = 0; i < cases.length; i++) {
    // single-linkage: join the first cluster with any member similar enough
    let target = -1;
    for (let ci = 0; ci < clusters.length && target === -1; ci++) {
      for (const m of clusters[ci].members) {
        if (jaccard(sets[i], sets[m]) >= SIMILARITY) {
          target = ci;
          break;
        }
      }
    }
    if (target === -1) {
      clusters.push({ members: [i] });
      clusterOf[i] = clusters.length - 1;
    } else {
      clusters[target].members.push(i);
      clusterOf[i] = target;
    }
  }

  const result = [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const members = clusters[ci].members.map((i) => cases[i]);
    const apps = new Set();
    for (const c of members) for (const a of c.apps) apps.add(a);
    const sequences = members
      .slice()
      .sort((a, b) => b.activities.length - a.activities.length)
      .map((c) => c.activities.map((a) => ({ name: a.name, app: a.app })));
    const { name, description } = await nameProcess(sequences);
    result.push({
      id: `P${ci + 1}`,
      name,
      description,
      caseIds: members.map((c) => c.caseId),
      apps: [...apps],
      caseCount: members.length,
      sequences: sequences.slice(0, 3),
    });
  }
  // biggest processes first
  return result.sort((a, b) => b.caseCount - a.caseCount).map((p, i) => ({ ...p, id: `P${i + 1}` }));
}
