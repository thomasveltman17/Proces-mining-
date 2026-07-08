/* FlowLens service worker: relays captured event batches from content
   scripts to the FlowLens server. Runs outside any page, so page CSP
   cannot block it; host_permissions in the manifest authorize the call. */

const DEFAULT_SERVER = 'http://localhost:4000';

async function serverUrl() {
  const { server } = await chrome.storage.sync.get(['server']);
  return (server || DEFAULT_SERVER).replace(/\/$/, '');
}

async function deliver(payload, attempt = 0) {
  const url = `${await serverUrl()}/api/events`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return res.ok;
  } catch {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 2000));
      return deliver(payload, attempt + 1);
    }
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flowlens-batch') {
    deliver(msg.payload).then((ok) => sendResponse({ ok }));
    return true; // keep the message channel open for the async response
  }
});
