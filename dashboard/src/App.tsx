import { useEffect, useState } from 'react';
import { fetchStats, Stats, Variant } from './api';
import ProcessMap from './ProcessMap';
import Variants from './Variants';
import Friction from './Friction';
import Sessions from './Sessions';

type Tab = 'map' | 'variants' | 'friction' | 'sessions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'Process map' },
  { id: 'variants', label: 'Variants' },
  { id: 'friction', label: 'Friction' },
  { id: 'sessions', label: 'Sessions' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('map');
  const [stats, setStats] = useState<Stats | null>(null);
  const [highlight, setHighlight] = useState<Variant | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, [tab]);

  const showOnMap = (v: Variant) => {
    setHighlight(v);
    setTab('map');
  };

  return (
    <>
      <div className="topbar">
        <div className="logo">
          Flow<span>Lens</span>
        </div>
        <div className="subtitle">behavioral process mining — mined from real user interactions, not system logs</div>
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
        {tab === 'map' && <ProcessMap highlight={highlight} onClearHighlight={() => setHighlight(null)} />}
        {tab === 'variants' && <Variants onShowOnMap={showOnMap} />}
        {tab === 'friction' && <Friction />}
        {tab === 'sessions' && <Sessions />}
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
