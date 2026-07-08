/**
 * Cross-app case stitching.
 *
 * With passive capture there is no `caseIdFrom` — the case identity must be
 * MINED. We pull stitching entities (invoice/PO/order/ticket IDs, and fuzzy
 * names via the AI layer) from each episode's text, then union episodes that
 * share a strong entity into one cross-app case. This is what links an Outlook
 * email, an Excel entry, and a browser ERP step that all concern invoice 1002.
 */

import { extractEntities } from '../ai.js';

/** Collect the searchable text of an episode (labels + window titles + pages). */
function episodeText(ep) {
  const parts = [];
  for (const e of ep.events) {
    if (e.label) parts.push(e.label);
    if (e.window_title) parts.push(e.window_title);
    if (e.page) parts.push(e.page);
  }
  return parts;
}

/**
 * Attach entities to each episode and union episodes sharing an entity into
 * cross-app cases via a small union-find.
 *
 * @returns {Array<{ id, entity, episodes, apps:Set, sessionIds:Set, startTs, endTs }>}
 */
export async function stitchCases(episodes) {
  // 1. entities per episode
  for (const ep of episodes) {
    ep.entities = await extractEntities(episodeText(ep));
  }

  // 2. union-find over episodes keyed by shared entity
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => parent.set(find(a), find(b));

  for (const ep of episodes) parent.set(ep.id, ep.id);

  const byEntity = new Map(); // entity -> first episode id seen
  for (const ep of episodes) {
    for (const ent of ep.entities) {
      if (byEntity.has(ent)) union(ep.id, byEntity.get(ent));
      else byEntity.set(ent, ep.id);
    }
  }

  // 3. group episodes by root
  const groups = new Map();
  for (const ep of episodes) {
    const root = find(ep.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(ep);
  }

  // 4. materialize cases
  const cases = [];
  for (const [root, eps] of groups) {
    eps.sort((a, b) => a.startTs - b.startTs);
    const apps = new Set();
    const sessionIds = new Set();
    const entities = new Set();
    for (const ep of eps) {
      for (const a of ep.apps) apps.add(a);
      sessionIds.add(ep.sessionId);
      for (const ent of ep.entities) entities.add(ent);
    }
    // A case's business id is its strongest shared entity, else the root episode.
    const entity = [...entities][0] ?? `episode:${root}`;
    cases.push({
      id: entity,
      entity,
      entities: [...entities],
      episodes: eps,
      apps,
      sessionIds,
      startTs: eps[0].startTs,
      endTs: Math.max(...eps.map((e) => e.endTs)),
    });
  }
  return cases;
}
