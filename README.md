# FlowLens — Behavioral Process Mining

A prototype of a different kind of process mining tool. Classic process mining
(Celonis-style) depends on event logs extracted from source systems — ERP
tables, CRM logs, database traces. That limits it to processes that happen to
leave system traces, and it misses everything that happens *between* those
logged steps: the actual human work in the browser.

**FlowLens mines processes directly from user behavior.** A drop-in JavaScript
tracker captures *semantic* interactions (what was clicked, which field was
filled, which page was viewed — never pixels, never keystroke values), an
abstraction layer turns them into a process-mining-ready event log, and a
mining engine discovers the real process, its variants, and its friction.

> Why not video recording? Video gives you pixels, which you'd have to
> reverse-engineer back into "what did the user do" — expensive, lossy, and
> privacy-hostile. Semantic DOM capture records the *meaning* of each
> interaction directly and produces exactly the `case / activity / timestamp`
> log that process mining algorithms need.

## Quick start

```bash
npm install
npm run seed     # populate with 62 simulated invoice-approval sessions
npm run build    # build the dashboard
npm start        # → http://localhost:4000
```

- **Dashboard** — http://localhost:4000/
- **Demo app** (instrumented invoice-approval tool) — http://localhost:4000/demo/
- **API** — http://localhost:4000/api/stats

Click through the demo app in another tab — approve or reject a few invoices —
then reload the dashboard: your real session is captured, abstracted, and
merged into the mined process within seconds. Try clicking **Approve** without
ticking the verification checkbox first: the resulting rage clicks show up on
the Friction tab.

## What's in the box

```
tracker/flowlens.js    Drop-in capture SDK (no build step, ~300 lines)
demo-app/              Mock invoice-approval app with the tracker installed
server/                Express + SQLite: ingest, abstraction, mining, friction, API
dashboard/             React + React Flow: process map, variants, friction, sessions
seed/                  Deterministic generator for 62 realistic sessions
```

### 1. Capture — `tracker/flowlens.js`

```html
<script src="/tracker/flowlens.js"></script>
<script>
  FlowLens.init({
    endpoint: '/api/events',
    app: 'invoice-approval',
    caseIdFrom: () => location.hash.match(/(INV-\d+)/)?.[1] ?? null,
  });
</script>
```

- Captures clicks, form submits, typing bursts, route changes, and session end.
- **Semantic labeling**: each event carries the best human-meaningful name for
  its target — `data-flowlens` attribute → `aria-label` → `<label>` text →
  button text → `name`/`id`. Annotating an element with
  `data-flowlens="Approve invoice"` gives that exact activity name.
- **Privacy by construction**: field *values* never leave the page — only the
  field's label, value length, and typing duration.
- **Case correlation**: a `caseIdFrom` callback ties interactions to the
  business object being worked on (invoice, ticket, order…). Without it,
  mining falls back to per-session cases.
- Client-side friction signals: rage clicks (≥3 clicks, same target, <1.2s)
  and dead clicks (no DOM reaction within 800ms).
- Events are batched and shipped via `fetch`/`sendBeacon`.

### 2. Abstraction — `server/src/abstraction.js`

Raw interactions are noisy (17 keystrokes, 3 clicks). The abstraction layer
turns them into meaningful activities:

- typing bursts in one field → `Fill "Rejection reason"`
- clicks → `Approve invoice` (from the semantic label)
- route changes → `View Invoice detail`
- consecutive repeats collapse into one activity with a repeat count
- events that happen *before* a case is known (browsing the inbox) are
  attributed forward to the case they lead into

### 3. Mining — `server/src/mining.js` + `server/src/friction.js`

- **Process discovery**: directly-follows graph with per-edge frequency and
  median transition time.
- **Variants**: every distinct end-to-end path, ranked by case count.
- **Friction detection** — the part log-based tools structurally cannot see:
  rage clicks, dead clicks, backtracking loops (A→B→A), slow transitions, and
  abandoned cases.

### 4. Dashboard — `dashboard/`

- **Process map**: auto-laid-out flow diagram; edge thickness = frequency,
  edge color = median transition time; min-frequency slider to declutter.
- **Variants**: ranked path explorer; "Show on map" highlights a variant's
  route through the process.
- **Friction**: severity-ranked behavioral pain points.
- **Sessions**: per-session activity timeline with pause annotations
  (event-based replay — no video needed).

## API

| Endpoint | Description |
|---|---|
| `POST /api/events` | Ingest a batch: `{ session, events }` |
| `GET /api/stats` | Headline counts |
| `GET /api/process-map?minFreq=n` | DFG nodes + edges |
| `GET /api/variants` | Ranked variants |
| `GET /api/friction` | Detected friction issues |
| `GET /api/sessions` / `GET /api/sessions/:id` | Session list / timeline |

## Development

```bash
npm run seed                 # reset + reseed the database (server/data/, gitignored)
npm run dev                  # rebuild dashboard + start server
npm run dev -w dashboard     # Vite dev server with HMR (proxies /api to :4000)
```

## Instrumenting your own app

1. Serve `tracker/flowlens.js` and point `endpoint` at a FlowLens server.
2. Provide `caseIdFrom` (or add `data-flowlens-case` to the DOM) so
   interactions attach to business cases.
3. Optionally annotate key elements with `data-flowlens="Activity name"` for
   exact activity naming — everything else is derived automatically.

## Status / limitations

Prototype. Single SQLite file, mining recomputed per request (fine up to tens
of thousands of events), no auth, light/desktop-first dashboard. Conformance
checking (compare against an intended happy path) is the natural next step.
