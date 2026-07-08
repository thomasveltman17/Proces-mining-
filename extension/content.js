/* FlowLens content script (isolated world).

   PASSIVE BY DEFAULT: recording is on for every http(s) site so process data
   is gathered automatically, without the user having to initiate anything per
   site. The only controls are a global PAUSE and an EXCLUSION list (banking,
   health, password managers ship excluded). This removes the "intent to
   record" problem — the user just works, and behavior flows in.

   The tracker core is loaded from vendor/flowlens.js. */
(async function () {
  const DEFAULT_EXCLUDES = ['accounts.google.com', 'login.microsoftonline.com'];

  const store = await chrome.storage.sync.get(['paused', 'excludedHosts', 'sites']);
  if (store.paused) return; // global pause

  const host = location.hostname;
  const excluded = new Set([...(store.excludedHosts ?? []), ...DEFAULT_EXCLUDES]);
  const site = store.sites?.[host] ?? {};

  // Per-site override can force-disable; otherwise passive default = ON.
  if (site.enabled === false) return;
  if (!site.enabled && [...excluded].some((h) => host === h || host.endsWith('.' + h))) return;

  window.FlowLens.init({
    app: site.appName || host,
    // Relayed through the service worker, so page CSP can't block delivery.
    transport: (payload) => {
      chrome.runtime.sendMessage({ type: 'flowlens-batch', payload }).catch(() => {});
    },
    pollNavigation: true,
    // No case regex needed anymore — the server discovers cases from shared
    // entities. A per-site regex still works as an optional hint if set.
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
