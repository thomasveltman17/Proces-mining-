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
export const fetchProcessMap = (minFreq: number, app = '', processId = '') =>
  get<ProcessMapData>(
    `/api/process-map?minFreq=${minFreq}${appQ(app, '&')}${processId ? `&process=${encodeURIComponent(processId)}` : ''}`
  );
export const fetchVariants = (app = '') => get<Variant[]>(`/api/variants${appQ(app)}`);
export const fetchFriction = (app = '') => get<FrictionIssue[]>(`/api/friction${appQ(app)}`);
export const fetchSessions = (app = '') => get<SessionSummary[]>(`/api/sessions${appQ(app)}`);
export const fetchSession = (id: string) => get<SessionDetail>(`/api/sessions/${id}`);

// ---- Cross-app process discovery ----

export interface DiscoveredProcess {
  id: string;
  name: string;
  description: string;
  apps: string[];
  caseCount: number;
  sampleSequence: { name: string; app: string | null }[];
}

export interface SourceInfo {
  source: string;
  events: number;
}

export interface ProcessesResponse {
  processes: DiscoveredProcess[];
  sources: SourceInfo[];
  totals: { cases: number; episodes: number; sessions: number };
}

export interface CaseSummary {
  id: string;
  entity: string;
  apps: string[];
  processId: string | null;
  activityCount: number;
  startTs: number;
}

export interface CaseDetail {
  id: string;
  entity: string;
  apps: string[];
  processId: string | null;
  timeline: { activity: string; app: string | null; ts: number; endTs: number; repeat: number }[];
}

export const fetchProcesses = () => get<ProcessesResponse>('/api/processes');
export const fetchProcessCases = (processId: string) =>
  get<CaseSummary[]>(`/api/cases?process=${encodeURIComponent(processId)}`);
export const fetchCase = (id: string) => get<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`);

export const START = '__start__';
export const END = '__end__';

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
