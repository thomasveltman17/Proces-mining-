import { useEffect, useState } from 'react';
import { AppInfo, fetchApps, fetchStats, Stats, Variant } from './api';
import ProcessMap from './ProcessMap';
import Variants from './Variants';
import Friction from './Friction';
import Sessions from './Sessions';
import Processes from './Processes';

type Tab = 'processes' | 'map' | 'variants' | 'friction' | 'sessions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'processes', label: 'Discovered processes' },
  { id: 'map', label: 'Process map' },
  { id: 'variants', label: 'Variants' },
  { id: 'friction', label: 'Friction' },
  { id: 'sessions', label: 'Sessions' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('processes');
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [app, setApp] = useState(''); // '' = all apps
  const [stats, setStats] = useState<Stats | null>(null);
  const [highlight, setHighlight] = useState<Variant | null>(null);

  useEffect(() => {
    fetchApps().then(setApps).catch(console.error);
  }, [tab]);

  useEffect(() => {
    fetchStats(app).then(setStats).catch(console.error);
  }, [tab, app]);

  const showOnMap = (v: Variant) => {
    setHighlight(v);
    setTab('map');
  };

  const selectApp = (next: string) => {
    setApp(next);
    setHighlight(null); // a variant belongs to one app's process
  };

  return (
    <>
      <div className="topbar">
        <div className="logo">
          Flow<span>Lens</span>
        </div>
        <div className="subtitle">behavioral process mining — mined from real user interactions, not system logs</div>
        {apps.length > 1 && (
          <select className="app-select" value={app} onChange={(e) => selectApp(e.target.value)}>
            <option value="">all apps</option>
            {apps.map((a) => (
              <option key={a.app} value={a.app}>
                {a.app} ({a.sessions})
              </option>
            ))}
          </select>
        )}
        <div className="spacer" />
        <a href="/demo/" target="_blank" rel="noreferrer">
          Open demo app ↗
        </a>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {stats && (
        <div className="stat-row">
          <StatTile value={stats.sessions} label="sessions captured" />
          <StatTile value={stats.cases} label="cases mined" />
          <StatTile value={stats.rawEvents} label="raw interactions" />
          <StatTile value={stats.activities} label="abstracted activities" />
          <StatTile value={stats.variants} label="process variants" />
        </div>
      )}
      <div className="content">
        {tab === 'processes' && <Processes />}
        {tab === 'map' && <ProcessMap app={app} highlight={highlight} onClearHighlight={() => setHighlight(null)} />}
        {tab === 'variants' && <Variants app={app} onShowOnMap={showOnMap} />}
        {tab === 'friction' && <Friction app={app} />}
        {tab === 'sessions' && <Sessions app={app} />}
      </div>
    </>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <div className="value">{value.toLocaleString()}</div>
      <div className="label">{label}</div>
    </div>
  );
}
