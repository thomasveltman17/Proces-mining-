export interface Stats {
  sessions: number;
  cases: number;
  rawEvents: number;
  activities: number;
  variants: number;
}

export interface MapNode {
  id: string;
  count: number;
  caseCount: number;
  medianDwellMs: number;
}

export interface MapEdge {
  from: string;
  to: string;
  count: number;
  caseCount: number;
  medianMs: number;
}

export interface ProcessMapData {
  nodes: MapNode[];
  edges: MapEdge[];
  totalCases: number;
}

export interface Variant {
  id: string;
  activities: string[];
  count: number;
  share: number;
  medianDurationMs: number;
  caseIds: string[];
}

export interface FrictionIssue {
  kind: string;
  title: string;
  detail: string;
  occurrences: number;
  affectedSessions: string[];
  severity: 'high' | 'medium' | 'low';
}

export interface SessionSummary {
  id: string;
  app: string;
  startedAt: number;
  lastSeenAt: number;
  durationMs: number;
  cases: { caseId: string; activityCount: number }[];
}

export interface SessionDetail {
  id: string;
  timeline: { caseId: string; activity: string; ts: number; endTs: number; repeat: number }[];
  rawEvents: { type: string; label: string | null; activity: string | null; page: string | null; ts: number }[];
}

export interface AppInfo {
  app: string;
  sessions: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/** app === '' means "all apps". */
const appQ = (app: string, sep = '?') => (app ? `${sep}app=${encodeURIComponent(app)}` : '');

export const fetchApps = () => get<AppInfo[]>('/api/apps');
export const fetchStats = (app = '') => get<Stats>(`/api/stats${appQ(app)}`);
export const fetchProcessMap = (minFreq: number, app = '') =>
  get<ProcessMapData>(`/api/process-map?minFreq=${minFreq}${appQ(app, '&')}`);
export const fetchVariants = (app = '') => get<Variant[]>(`/api/variants${appQ(app)}`);
export const fetchFriction = (app = '') => get<FrictionIssue[]>(`/api/friction${appQ(app)}`);
export const fetchSessions = (app = '') => get<SessionSummary[]>(`/api/sessions${appQ(app)}`);
export const fetchSession = (id: string) => get<SessionDetail>(`/api/sessions/${id}`);

export const START = '__start__';
export const END = '__end__';

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
