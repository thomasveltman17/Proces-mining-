import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType, Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { END, fetchProcessMap, fmtDuration, ProcessMapData, START, Variant } from './api';

/* Sequential blue ramp (ordinal use: starts at step 250) — darker = slower. */
const DURATION_RAMP: { maxMs: number; color: string; label: string }[] = [
  { maxMs: 2_000, color: '#86b6ef', label: '< 2s' },
  { maxMs: 8_000, color: '#3987e5', label: '2–8s' },
  { maxMs: 20_000, color: '#1c5cab', label: '8–20s' },
  { maxMs: Infinity, color: '#0d366b', label: '> 20s' },
];

function durationColor(ms: number): string {
  return DURATION_RAMP.find((r) => ms < r.maxMs)!.color;
}

function edgeWidth(count: number, maxCount: number): number {
  return 1.5 + (count / Math.max(1, maxCount)) * 6;
}

function nodeSize(label: string): { width: number; height: number } {
  return { width: Math.max(120, Math.min(230, label.length * 7 + 40)), height: 54 };
}

function layout(data: ProcessMapData, highlightPairs: Set<string> | null): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 45, ranksep: 60, marginx: 20, marginy: 20 });

  for (const n of data.nodes) g.setNode(n.id, nodeSize(n.id));
  for (const e of data.edges) g.setEdge(e.from, e.to);
  dagre.layout(g);

  const maxCount = Math.max(...data.edges.map((e) => e.count), 1);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    const terminal = n.id === START || n.id === END;
    const dimmed = highlightPairs !== null && !isNodeInHighlight(n.id, highlightPairs);
    return {
      id: n.id,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      style: {
        opacity: dimmed ? 0.25 : 1,
        padding: 0,
        border: 'none',
        background: 'transparent',
        width: pos.width,
        fontSize: 12,
      },
      data: {
        label: terminal ? (
          <div className="rf-terminal">{n.id === START ? '▶ start' : '■ end'}</div>
        ) : (
          <div className="rf-activity">
            <div className="name">{n.id}</div>
            <div className="stats">
              {n.count}× · {n.caseCount} cases
            </div>
          </div>
        ),
      },
      // Bare content nodes: the inner div carries all visuals.
      type: 'default',
      width: pos.width,
      height: pos.height,
      connectable: false,
      draggable: true,
    };
  });

  const edges: Edge[] = data.edges.map((e) => {
    const inPath = highlightPairs === null || highlightPairs.has(`${e.from}→${e.to}`);
    const color = durationColor(e.medianMs);
    return {
      id: `${e.from}→${e.to}`,
      source: e.from,
      target: e.to,
      label: `${e.count}× · ${fmtDuration(e.medianMs)}`,
      labelStyle: { fontSize: 10, fill: '#52514e' },
      labelBgStyle: { fill: '#fcfcfb', opacity: 0.9 },
      style: {
        stroke: color,
        strokeWidth: edgeWidth(e.count, maxCount),
        opacity: inPath ? 1 : 0.12,
      },
      // Marker size scales with strokeWidth — keep it modest so thick edges don't grow giant arrowheads.
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 7, height: 7 },
      type: 'smoothstep',
    };
  });

  return { nodes, edges };
}

function isNodeInHighlight(id: string, pairs: Set<string>): boolean {
  for (const p of pairs) {
    const [from, to] = p.split('→');
    if (from === id || to === id) return true;
  }
  return false;
}

export default function ProcessMap({
  app,
  highlight,
  onClearHighlight,
}: {
  app: string;
  highlight: Variant | null;
  onClearHighlight: () => void;
}) {
  const [minFreq, setMinFreq] = useState(2);
  const [data, setData] = useState<ProcessMapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProcessMap(minFreq, app)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [minFreq, app]);

  const highlightPairs = useMemo(() => {
    if (!highlight) return null;
    const pairs = new Set<string>();
    const seq = [START, ...highlight.activities, END];
    for (let i = 0; i + 1 < seq.length; i++) pairs.add(`${seq[i]}→${seq[i + 1]}`);
    return pairs;
  }, [highlight]);

  const flow = useMemo(() => (data ? layout(data, highlightPairs) : null), [data, highlightPairs]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Discovered process map</h2>
        <span className="hint">
          {data ? `${data.totalCases} cases · edge thickness = frequency, color = median transition time` : 'loading…'}
        </span>
        <div className="slider-group">
          <span>min. edge frequency: {minFreq}</span>
          <input
            type="range"
            min={1}
            max={15}
            value={minFreq}
            onChange={(e) => setMinFreq(Number(e.target.value))}
          />
        </div>
        <div className="map-legend">
          {DURATION_RAMP.map((r) => (
            <span key={r.label}>
              <span className="swatch" style={{ background: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
        {highlight && (
          <button className="badge-clear" onClick={onClearHighlight}>
            showing variant {highlight.id} ({highlight.count} cases) — clear ✕
          </button>
        )}
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        {error && <div className="empty">Failed to load process map: {error}</div>}
        {flow && (
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            fitView
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
          >
            <Background color="#e1e0d9" gap={22} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
