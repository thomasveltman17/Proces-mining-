import { Fragment, useEffect, useState } from 'react';
import {
  CaseDetail,
  CaseSummary,
  DiscoveredProcess,
  fetchCase,
  fetchProcessCases,
  fetchProcesses,
  fmtDuration,
  ProcessesResponse,
} from './api';
import ProcessMap from './ProcessMap';

/* Per-app badge colors — categorical palette (identity, not magnitude). */
const APP_COLORS: Record<string, string> = {
  Outlook: '#2a78d6',
  Excel: '#1baf7a',
  'PDF Viewer': '#e34948',
  Calendar: '#eda100',
};
function appColor(app: string): string {
  if (APP_COLORS[app]) return APP_COLORS[app];
  return app.includes('.com') ? '#4a3aa7' : '#898781'; // web apps violet, else muted
}
function AppBadge({ app }: { app: string | null }) {
  const name = app ?? '—';
  return (
    <span className="app-badge" style={{ background: appColor(name) }}>
      {name}
    </span>
  );
}

export default function Processes() {
  const [data, setData] = useState<ProcessesResponse | null>(null);
  const [selected, setSelected] = useState<DiscoveredProcess | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);

  useEffect(() => {
    fetchProcesses().then(setData).catch(console.error);
  }, []);

  const openProcess = (p: DiscoveredProcess) => {
    setSelected(p);
    setCaseDetail(null);
    setCases(null);
    fetchProcessCases(p.id).then(setCases).catch(console.error);
  };

  if (selected) {
    return (
      <div className="split">
        <div className="panel">
          <div className="panel-header">
            <button className="small" onClick={() => setSelected(null)}>
              ← all processes
            </button>
            <h2>{selected.name}</h2>
            <span className="hint">
              {selected.caseCount} cases · {selected.apps.map((a) => a).join(' · ')}
            </span>
          </div>
          <div className="panel-body" style={{ overflow: 'hidden', display: 'flex' }}>
            <ProcessMap app="" processId={selected.id} highlight={null} onClearHighlight={() => {}} />
          </div>
        </div>
        <div className="panel" style={{ flex: 0.8 }}>
          <div className="panel-header">
            <h2>{caseDetail ? `Case ${caseDetail.entity}` : 'Cross-app cases'}</h2>
            <span className="hint">
              {caseDetail ? 'one stitched run across apps' : 'each case was stitched from a shared entity'}
            </span>
          </div>
          <div className="panel-body">
            {!caseDetail && cases && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Apps spanned</th>
                    <th>Steps</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => fetchCase(c.id).then(setCaseDetail)}>
                      <td>{c.entity}</td>
                      <td>
                        <div className="chip-seq">
                          {c.apps.map((a) => (
                            <AppBadge key={a} app={a} />
                          ))}
                        </div>
                      </td>
                      <td className="num">{c.activityCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {caseDetail && (
              <div className="timeline">
                <button className="small" style={{ marginBottom: 12 }} onClick={() => setCaseDetail(null)}>
                  ← cases
                </button>
                {caseDetail.timeline.map((item, i) => {
                  const prev = caseDetail.timeline[i - 1];
                  const gap = prev ? item.ts - prev.endTs : 0;
                  const appSwitch = prev && prev.app !== item.app;
                  return (
                    <Fragment key={i}>
                      {i > 0 && gap > 1500 && <div className="timeline-gap">⏱ {fmtDuration(gap)}</div>}
                      <div className="timeline-item">
                        <div className="timeline-dot" style={{ background: appColor(item.app ?? ''), boxShadow: `0 0 0 1px ${appColor(item.app ?? '')}` }} />
                        <div className="timeline-body">
                          <div className="act">
                            {item.activity}
                            {item.repeat > 1 ? ` (×${item.repeat})` : ''}
                          </div>
                          <div className="when">
                            <AppBadge app={item.app} />
                            {appSwitch && <span className="switch-tag">app switch</span>}
                            <span style={{ marginLeft: 6 }}>{new Date(item.ts).toLocaleTimeString()}</span>
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

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Discovered processes</h2>
        <span className="hint">
          auto-discovered from passive cross-app capture — no one defined these, or where a case starts and ends
        </span>
        {data && (
          <div className="sources">
            {data.sources.map((s) => (
              <span key={s.source} className="source-pill">
                {s.source === 'browser' ? '🌐 browser' : '🖥 desktop'} · {s.events.toLocaleString()} events
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="panel-body">
        {!data && <div className="empty">loading…</div>}
        {data && (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Process (auto-named)</th>
                <th style={{ width: 90 }}>Cases</th>
                <th>Apps involved</th>
                <th>Typical path</th>
              </tr>
            </thead>
            <tbody>
              {data.processes.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => openProcess(p)}>
                  <td>{p.id}</td>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="num">{p.caseCount}</td>
                  <td>
                    <div className="chip-seq">
                      {p.apps.map((a) => (
                        <AppBadge key={a} app={a} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="chip-seq">
                      {p.sampleSequence.slice(0, 6).map((a, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="chip-arrow">→</span>}
                          <span className="chip">{a.name}</span>
                        </Fragment>
                      ))}
                      {p.sampleSequence.length > 6 && <span className="chip-arrow">…</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
