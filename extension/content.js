/* FlowLens content script (isolated world).
   Recording is opt-in per site via the popup — nothing is captured on
   sites the user hasn't explicitly enabled. The tracker core is loaded
   from vendor/flowlens.js (a copy of tracker/flowlens.js). */
(async function () {
  // Don't record the FlowLens dashboard/demo itself through the extension —
  // the demo app already has the snippet installed.
  const store = await chrome.storage.sync.get(['sites']);
  const site = store.sites?.[location.hostname];
  if (!site || !site.enabled) return;

  window.FlowLens.init({
    app: site.appName || location.hostname,
    // The extension relays batches through its service worker, so the page's
    // Content-Security-Policy can't block delivery to the local server.
    transport: (payload) => {
      chrome.runtime.sendMessage({ type: 'flowlens-batch', payload }).catch(() => {});
    },
    // history.pushState can't be patched from the isolated world → poll.
    pollNavigation: true,
    caseIdFrom: site.caseRegex
      ? () => {
          try {
            const m = location.href.match(new RegExp(site.caseRegex));
            return m ? (m[1] ?? m[0]) : null;
          } catch {
            return null;
          }
        }
      : undefined,
  });
})();
