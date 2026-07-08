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

## Mining apps you DON'T control — the browser extension

The snippet requires editing the target page. For third-party software (your
bookkeeping SaaS, your CRM, any web tool), use the **FlowLens Recorder
extension** instead — it injects the same tracker into any site you enable it
on, with zero changes to the target app:

1. Start the FlowLens server (`npm start`).
2. Open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*,
   and select the `extension/` folder.
3. Visit the app you want to mine, click the FlowLens icon, and turn on
   **Record this site** (recording is opt-in per site, default off). Optionally
   set an app name and a case-id regex on the URL (e.g. `invoices/(\d+)`).
4. Reload the page and work normally. The dashboard grows an app selector as
   soon as a second app shows up.

Events are relayed through the extension's service worker, so the target
page's Content-Security-Policy cannot block delivery. Labels are derived
generically (aria-labels, `<label>` text, button text) — no annotations
needed. Try it on the built-in, deliberately *uninstrumented* mock
bookkeeping app at http://localhost:4000/demo/books/ with case regex
`(JE-\d+)`.

Caveats: DOM-based apps work well; canvas-rendered UIs (Google-Sheets-style
editors) expose no semantics to read. Desktop (non-browser) apps are out of
scope.

## Passive, cross-app process discovery (no intent, no per-app work)

The extension and snippet still need *someone to turn recording on* and only
see the browser. The bigger goal is to capture **all** desktop behavior —
Outlook, Excel, a calendar, a browser — **passively**, and let the system
**discover the processes by itself**, with no one defining where a case starts
or what an activity is.

**How the capture generalizes without a connector per app:** every desktop OS
already exposes a *semantic* description of every application to assistive tech
— **Windows UI Automation**, **macOS Accessibility**, **Linux AT-SPI**. One
background agent reading that tree sees Outlook's "Send" button and Excel's
active cell the same way the browser tracker sees a web button — the same
"capture meaning, not pixels" idea, one layer lower, with zero integration per
app. Where accessibility is thin (canvas apps, remote desktop), a **vision-LLM
fallback** screenshots the focused window and asks Claude what's happening. See
`desktop-agent/ARCHITECTURE.md`.

**How processes are discovered with no case definition:** the server mines the
firehose. `server/src/discovery/` segments the stream into task **episodes**,
extracts **entities** (invoice/PO/order IDs, and fuzzy names via Claude),
**stitches** episodes that share an entity into one cross-app case (an Outlook
email + an Excel entry + a browser ERP step, all about invoice 1002),
**normalizes** activities into canonical names, and **clusters** cases into
auto-named processes — then runs the existing miner. The **Discovered
processes** dashboard tab shows the result: named processes, the apps each
spans, and per-case timelines that hop between apps with "app switch" tags.

```bash
npm run seed           # browser demo sessions
npm run seed:desktop   # simulated cross-app desktop feed (Outlook/Excel/ERP/calendar)
npm run dev            # → http://localhost:4000  (opens on Discovered processes)
```

The AI layer (`server/src/ai.js`, model `claude-opus-4-8`) drives activity
labeling, entity extraction, and process naming. **Every AI call has a
deterministic offline fallback**, so the whole pipeline runs and is verifiable
with no API key; set `ANTHROPIC_API_KEY` to use real Claude (and the vision
path). Recording is **passive by default** in the extension now — on for every
site except a configurable exclusion list, with a global pause; field values
are still never captured.

> Sandbox note: the native accessibility agent is shipped as a spec + skeleton
> (`desktop-agent/`) because it can't run in a headless Linux container.
> `npm run agent:simulate` replays the simulated feed through the real emit
> path; because every source emits the identical event schema, swapping in a
> real OS agent changes nothing downstream.

## What's in the box

```
tracker/flowlens.js    Drop-in capture SDK (no build step, ~300 lines)
extension/             Chrome extension (MV3): passive-by-default browser capture
desktop-agent/         OS-accessibility + vision-LLM capture — spec + runnable skeleton
demo-app/              Mock invoice-approval app with the tracker installed
demo-app/books/        Mock "third-party" bookkeeping app WITHOUT tracker
server/                Express + SQLite: ingest, discovery engine, mining, friction, API
server/src/discovery/  segment → stitch entities → normalize → cluster → name
server/src/ai.js       Claude labeling/extraction/naming with offline fallbacks
dashboard/             React + React Flow: discovered processes, cross-app cases, map, friction
seed/                  Browser sessions + simulated cross-app desktop feed
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
| `GET /api/apps` | Captured apps with session counts |
| `GET /api/processes` | Auto-discovered cross-app processes (name, apps, case count) |
| `GET /api/cases` / `GET /api/cases/:id` | Stitched cross-app cases / one case's cross-app timeline |
| `GET /api/process-map?process=P2` | DFG for one discovered process |
| `GET /api/stats` | Headline counts (map/variants/friction accept `?app=` to scope) |
| `GET /api/process-map?minFreq=n` | DFG nodes + edges |
| `GET /api/variants` | Ranked variants |
| `GET /api/friction` | Detected friction issues |
| `GET /api/sessions` / `GET /api/sessions/:id` | Session list / timeline |

## Development

```bash
npm run seed                 # reset + reseed the database (server/data/, gitignored)
npm run dev                  # rebuild dashboard + start server
npm run dev -w dashboard     # Vite dev server with HMR (proxies /api to :4000)
npm run build:ext            # refresh extension/vendor/flowlens.js after tracker changes
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
