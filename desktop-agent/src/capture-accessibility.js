/**
 * Accessibility capture — the PRIMARY, application-agnostic path.
 *
 * Reads the OS accessibility tree (Windows UI Automation / macOS AX / Linux
 * AT-SPI) and turns focus/value/invoke events into unified FlowLens events —
 * the same "capture meaning, not pixels" idea as the browser tracker, one layer
 * lower and with NO per-app integration.
 *
 * The native bindings are platform-specific and cannot run in this headless
 * Linux sandbox, so this file documents the interface and the per-OS binding
 * that a production build would wire up. `startAccessibilityCapture` throws on
 * an unsupported/headless host; the simulated feed exercises the identical
 * downstream path (see index.js --simulate and seed/generate-desktop.js).
 */

/**
 * Map a raw accessibility event to a unified FlowLens event.
 * @param {object} axEvent { controlType, name, value, windowTitle, appName, kind }
 * @returns unified event (no field values)
 */
export function axEventToFlowLens(axEvent) {
  const { controlType, name, windowTitle, appName, kind, value } = axEvent;
  const typeByControl = {
    button: 'click',
    menuitem: 'click',
    hyperlink: 'click',
    edit: 'input',
    document: 'nav',
    tab: 'nav',
    window: 'nav',
  };
  return {
    type: typeByControl[controlType] ?? kind ?? 'click',
    // The accessible NAME is the semantic label. For edits we keep only the
    // length of the value, never the value itself.
    label: name || windowTitle || controlType,
    app: appName,
    windowTitle,
    source: 'desktop_ax',
    valueLen: typeof value === 'string' ? value.length : undefined,
    ts: Date.now(),
  };
}

/**
 * Start capturing. In production this subscribes to the platform accessibility
 * event stream and calls `onEvent(axEventToFlowLens(raw))` for each interaction.
 *
 * Per-OS binding (production):
 *   - Windows: IUIAutomation.AddFocusChangedEventHandler / AddAutomationEventHandler
 *     (Invoke, Value patterns) via a C#/C++ helper piping JSON to Node.
 *   - macOS:   AXObserverAddNotification for kAXFocusedUIElementChanged /
 *     kAXValueChangedNotification via a Swift helper (needs the a11y grant).
 *   - Linux:   AT-SPI2 over D-Bus: subscribe to object:state-changed:focused
 *     and object:text-changed.
 */
export function startAccessibilityCapture(/* onEvent */) {
  throw new Error(
    'Native accessibility capture is not available on this host. ' +
      'See desktop-agent/ARCHITECTURE.md for per-OS bindings; use --simulate to exercise the pipeline.'
  );
}
