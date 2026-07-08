async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab.url).hostname;
  } catch {
    return null;
  }
}

(async function () {
  const host = await currentHost();
  document.getElementById('host').textContent = host ?? 'no recordable page';

  const { sites = {}, server = '' } = await chrome.storage.sync.get(['sites', 'server']);
  const site = (host && sites[host]) || {};

  const $enabled = document.getElementById('enabled');
  const $appName = document.getElementById('appName');
  const $caseRegex = document.getElementById('caseRegex');
  const $server = document.getElementById('server');

  $enabled.checked = !!site.enabled;
  $appName.value = site.appName ?? '';
  $caseRegex.value = site.caseRegex ?? '';
  $server.value = server;

  const dashBase = (server || 'http://localhost:4000').replace(/\/$/, '');
  document.getElementById('dash').href = dashBase;

  document.getElementById('save').addEventListener('click', async () => {
    if (host) {
      sites[host] = {
        enabled: $enabled.checked,
        appName: $appName.value.trim(),
        caseRegex: $caseRegex.value.trim(),
      };
    }
    await chrome.storage.sync.set({ sites, server: $server.value.trim() });
    document.getElementById('saved').textContent = 'Saved — reload the page to apply.';
  });
})();
