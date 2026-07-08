# FlowLens Desktop Agent

Passive, cross-app behavioral capture for the whole desktop — Outlook, Excel, a
calendar, a browser, any native app — with **no per-app integration** and
**no user intent** beyond installing the agent once.

## The problem it solves

The browser tracker and extension only see the browser, and they still ask the
user to define what a "case" is. Real work spans many applications and nobody
should have to annotate it. We need to observe *everything the user does across
every app*, passively, and let the server discover the processes.

## The key idea — accessibility trees, not connectors

Writing a connector per application (an Outlook add-in, an Excel plugin, an ERP
API integration…) does not scale — it's endless bespoke work. The general
mechanism already exists in every desktop OS: the **accessibility API**, built
so screen readers can describe *any* application to a blind user. It exposes a
live semantic tree for every window: control type (button, edit, cell, menu
item), its name/label, its value, the focused element, and the window title.

That is exactly the "capture meaning, not pixels" idea the browser tracker uses
(`aria-label`, button text…) — one layer lower, and **application-agnostic**.
One background agent reading the accessibility tree sees Outlook's "Send"
button and Excel's active cell the same way the DOM tracker sees a web button —
with zero code written for Outlook or Excel.

| OS | API | Node/bridge options |
|----|-----|---------------------|
| Windows | **UI Automation (UIA)** | `IUIAutomation` COM via `edge-js`/`node-ffi-napi`; or a small C#/C++ helper piping JSON to Node |
| macOS | **Accessibility (AX) API** | `AXUIElement` via a Swift/ObjC helper; `node-mac-permissions` for the a11y grant |
| Linux | **AT-SPI2** | `at-spi2-core` over D-Bus (`dbus-next`) |

The agent subscribes to focus-change / value-change / invoke events on the
accessibility tree and emits one **unified event** per meaningful interaction.

## The fallback — screenshots + a vision LLM

Some surfaces expose a thin or empty accessibility tree: `<canvas>`-based apps,
custom-drawn UIs, games, remote-desktop/Citrix windows, screen-shared content.
There, the universal fallback is to periodically **screenshot the focused
window and ask a vision model (Claude) what the user is doing**, returning the
same semantic event shape. This is `capture-vision.js` and it is real code —
`ai.describeScreenshot()` uses Claude high-resolution vision. It is used
*sparingly* (only when accessibility is thin), because continuous screenshotting
is costly; accessibility is always the primary path.

## Unified event schema (the contract)

Every capture path — browser extension, desktop accessibility, desktop vision,
and the simulated feed — emits the **same** event, posted to `POST /api/events`:

```jsonc
{
  "session": { "id": "device_anna", "app": "workstation-anna", "source": "desktop_ax", "startedAt": 0 },
  "events": [{
    "type": "click | input | nav | open | send | save | ...",
    "label": "Approve invoice INV-1002",   // the semantic action (never a field value)
    "app": "Outlook",                        // application / hostname
    "windowTitle": "Inbox — Nordic Supplies",
    "source": "desktop_ax",                  // desktop_ax | desktop_vision | browser
    "ts": 1730000000000,
    "durationMs": 1200
    // NOTE: no caseId — the server discovers the case from shared entities
  }]
}
```

Because the schema is identical, **swapping the simulated feed for a real
accessibility agent changes nothing downstream** — the discovery engine,
mining, and dashboard are unaffected.

## Privacy model

- **Values are never captured** — only the *label* of what was acted on and its
  timing. Typing "hunter2" into a password field records `Fill "Password"`,
  never the value.
- **Exclusion list** — apps and window titles matching a configurable blocklist
  (password managers, banking, health) are dropped at the source, before any
  event is created.
- **Global pause** — one switch stops all capture.
- Capture is passive-by-default (that is the point — remove intent), so the
  exclusion list and pause are the user's controls, not an opt-in per surface.

## What runs where in this prototype

This repo runs in a headless Linux sandbox, so the native accessibility
bindings (`capture-accessibility.js`) are a documented skeleton, not a running
capture loop. Everything downstream of the event schema is real and verified
via `seed/generate-desktop.js`, which emits exactly the events a real agent
would. `capture-vision.js` is real and runnable against any PNG when an
`ANTHROPIC_API_KEY` is present. `npm run agent:simulate` replays the simulated
feed through the real emit path to demonstrate the full loop.
