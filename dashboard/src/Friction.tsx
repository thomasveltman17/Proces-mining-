import { useEffect, useState } from 'react';
import { fetchFriction, FrictionIssue } from './api';

const SEV_LABEL: Record<string, string> = { high: '⛔ high', medium: '▲ medium', low: '◦ low' };
const KIND_LABEL: Record<string, string> = {
  rage_click: 'rage clicks',
  dead_click: 'dead clicks',
  backtrack_loop: 'backtracking',
  slow_step: 'slow step',
  abandonment: 'abandonment',
};

export default function Friction({ app }: { app: string }) {
  const [issues, setIssues] = useState<FrictionIssue[] | null>(null);

  useEffect(() => {
    fetchFriction(app).then(setIssues).catch(console.error);
  }, [app]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Friction &amp; bottlenecks</h2>
        <span className="hint">behavioral pain points that system logs can't see — mined from interaction patterns</span>
      </div>
      <div className="panel-body">
        {!issues && <div className="empty">loading…</div>}
        {issues && issues.length === 0 && <div className="empty">No friction detected. Either the UX is perfect or there's no data yet.</div>}
        {issues && issues.length > 0 && (
          <div className="friction-list">
            {issues.map((issue, i) => (
              <div key={i} className={`friction-card ${issue.severity}`}>
                <div className="title-row">
                  <span className={`sev ${issue.severity}`}>{SEV_LABEL[issue.severity]}</span>
                  <h3>{issue.title}</h3>
                </div>
                <div className="detail">{issue.detail}</div>
                <div className="meta">
                  {KIND_LABEL[issue.kind] ?? issue.kind} · {issue.occurrences} occurrence{issue.occurrences === 1 ? '' : 's'}
                  {issue.affectedSessions.length > 0 && ` · ${issue.affectedSessions.length} affected`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
