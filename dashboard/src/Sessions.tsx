import { Fragment, useEffect, useState } from 'react';
import { fetchSession, fetchSessions, fmtDuration, SessionDetail, SessionSummary } from './api';

export default function Sessions() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [selected, setSelected] = useState<SessionDetail | null>(null);

  useEffect(() => {
    fetchSessions().then(setSessions).catch(console.error);
  }, []);

  const open = (id: string) => fetchSession(id).then(setSelected).catch(console.error);

  return (
    <div className="split">
      <div className="panel">
        <div className="panel-header">
          <h2>Captured sessions</h2>
          <span className="hint">one row per browser session — click to inspect its timeline</span>
        </div>
        <div className="panel-body">
          {!sessions && <div className="empty">loading…</div>}
          {sessions && sessions.length === 0 && <div className="empty">No sessions captured yet.</div>}
          {sessions && sessions.length > 0 && (
            <table className="data">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Cases handled</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => open(s.id)}>
                    <td>{s.id}</td>
                    <td className="num">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="num">{fmtDuration(s.durationMs)}</td>
                    <td>
                      <div className="chip-seq">
                        {s.cases.map((c) => (
                          <span key={c.caseId} className="chip">
                            {c.caseId.startsWith('session:') ? '(no case)' : c.caseId} · {c.activityCount} steps
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>{selected ? `Timeline — ${selected.id}` : 'Timeline'}</h2>
          {selected && <span className="hint">{selected.timeline.length} activities</span>}
        </div>
        <div className="panel-body">
          {!selected && <div className="empty">Select a session on the left to replay its steps.</div>}
          {selected && (
            <div className="timeline">
              {selected.timeline.map((item, i) => {
                const prev = selected.timeline[i - 1];
                const gap = prev ? item.ts - prev.endTs : 0;
                return (
                  <Fragment key={i}>
                    {i > 0 && gap > 1500 && <div className="timeline-gap">⏱ {fmtDuration(gap)} pause</div>}
                    <div className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="act">
                          {item.activity}
                          {item.repeat > 1 ? ` (×${item.repeat})` : ''}
                        </div>
                        <div className="when">
                          {new Date(item.ts).toLocaleTimeString()} · {item.caseId.startsWith('session:') ? 'no case' : item.caseId}
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
