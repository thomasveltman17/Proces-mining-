import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'flowlens.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    app           TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL,
    user_agent    TEXT
  );

  CREATE TABLE IF NOT EXISTS raw_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    case_id     TEXT,
    type        TEXT NOT NULL,
    label       TEXT,
    selector    TEXT,
    page        TEXT,
    value_len   INTEGER,
    duration_ms INTEGER,
    ts          INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_raw_events_session ON raw_events(session_id, ts);
  CREATE INDEX IF NOT EXISTS idx_raw_events_case ON raw_events(case_id, ts);
`);

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, app, started_at, last_seen_at, user_agent)
  VALUES (@id, @app, @startedAt, @lastSeenAt, @userAgent)
  ON CONFLICT(id) DO UPDATE SET last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
`);

const insertEvent = db.prepare(`
  INSERT INTO raw_events (session_id, case_id, type, label, selector, page, value_len, duration_ms, ts)
  VALUES (@sessionId, @caseId, @type, @label, @selector, @page, @valueLen, @durationMs, @ts)
`);

export const ingestBatch = db.transaction((session, events) => {
  upsertSession.run({
    id: session.id,
    app: session.app ?? 'unknown',
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt ?? session.startedAt,
    userAgent: session.userAgent ?? null,
  });
  for (const e of events) {
    insertEvent.run({
      sessionId: session.id,
      caseId: e.caseId ?? null,
      type: e.type,
      label: e.label ?? null,
      selector: e.selector ?? null,
      page: e.page ?? null,
      valueLen: e.valueLen ?? null,
      durationMs: e.durationMs ?? null,
      ts: e.ts,
    });
  }
});

export function allEvents() {
  return db
    .prepare('SELECT * FROM raw_events ORDER BY ts, id')
    .all();
}

export function allSessions() {
  return db.prepare('SELECT * FROM sessions ORDER BY started_at').all();
}

export function eventsForSession(sessionId) {
  return db
    .prepare('SELECT * FROM raw_events WHERE session_id = ? ORDER BY ts, id')
    .all(sessionId);
}
