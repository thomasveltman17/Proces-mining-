import { Router } from 'express';
import { allEvents, allSessions, eventsForSession, ingestBatch, listApps } from './db.js';
import { activityName, buildCases } from './abstraction.js';
import { discoverProcessMap, discoverVariants } from './mining.js';
import { analyzeFriction } from './friction.js';

export const api = Router();

api.post('/events', (req, res) => {
  const { session, events } = req.body ?? {};
  if (!session?.id || !session?.startedAt || !Array.isArray(events)) {
    return res.status(400).json({ error: 'expected { session: {id, startedAt}, events: [...] }' });
  }
  const valid = events.filter((e) => e && typeof e.type === 'string' && typeof e.ts === 'number');
  ingestBatch(session, valid);
  res.json({ ok: true, ingested: valid.length });
});

api.get('/apps', (_req, res) => {
  res.json(listApps());
});

api.get('/stats', (req, res) => {
  const app = req.query.app || undefined;
  const events = allEvents(app);
  const cases = buildCases(events);
  const variants = discoverVariants(cases);
  res.json({
    sessions: allSessions(app).length,
    cases: cases.size,
    rawEvents: events.length,
    activities: [...cases.values()].reduce((n, c) => n + c.activities.length, 0),
    variants: variants.length,
  });
});

api.get('/process-map', (req, res) => {
  const minFreq = Number(req.query.minFreq ?? 0);
  const cases = buildCases(allEvents(req.query.app || undefined));
  const { nodes, edges } = discoverProcessMap(cases);
  const keptEdges = edges.filter((e) => e.count >= minFreq);
  const connected = new Set(keptEdges.flatMap((e) => [e.from, e.to]));
  res.json({
    nodes: nodes.filter((n) => connected.has(n.id)),
    edges: keptEdges,
    totalCases: cases.size,
  });
});

api.get('/variants', (req, res) => {
  const cases = buildCases(allEvents(req.query.app || undefined));
  res.json(discoverVariants(cases));
});

api.get('/friction', (req, res) => {
  const events = allEvents(req.query.app || undefined);
  const cases = buildCases(events);
  res.json(analyzeFriction(events, cases));
});

api.get('/sessions', (req, res) => {
  const app = req.query.app || undefined;
  const events = allEvents(app);
  const byCaseOfSession = new Map();
  for (const [key, c] of buildCases(events)) {
    for (const sid of c.sessionIds) {
      if (!byCaseOfSession.has(sid)) byCaseOfSession.set(sid, []);
      byCaseOfSession.get(sid).push({ caseId: key, activityCount: c.activities.length });
    }
  }
  const list = allSessions(app).map((s) => ({
    id: s.id,
    app: s.app,
    startedAt: s.started_at,
    lastSeenAt: s.last_seen_at,
    durationMs: s.last_seen_at - s.started_at,
    cases: byCaseOfSession.get(s.id) ?? [],
  }));
  res.json(list.sort((a, b) => b.startedAt - a.startedAt));
});

api.get('/sessions/:id', (req, res) => {
  const events = eventsForSession(req.params.id);
  if (events.length === 0) return res.status(404).json({ error: 'session not found' });
  const cases = buildCases(events);
  const timeline = [...cases.values()].flatMap((c) =>
    c.activities.map((a) => ({
      caseId: c.caseId,
      activity: a.name,
      ts: a.ts,
      endTs: a.endTs,
      repeat: a.repeat,
    }))
  );
  timeline.sort((a, b) => a.ts - b.ts);
  res.json({
    id: req.params.id,
    timeline,
    rawEvents: events.map((e) => ({
      type: e.type,
      label: e.label,
      activity: activityName(e),
      page: e.page,
      ts: e.ts,
    })),
  });
});
