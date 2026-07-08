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

  const { paused = false, excludedHosts = [], server = '' } = await chrome.storage.sync.get([
    'paused',
    'excludedHosts',
    'server',
  ]);

  const $paused = document.getElementById('paused');
  const $exclude = document.getElementById('excludeSite');
  const $server = document.getElementById('server');
  const $state = document.getElementById('siteState');

  $paused.checked = !!paused;
  $exclude.checked = host ? excludedHosts.includes(host) : false;
  $server.value = server;

  function refreshState() {
    const recording = !$paused.checked && !$exclude.checked;
    $state.textContent = recording ? 'recording' : 'excluded';
    $state.className = 'state ' + (recording ? 'on' : 'off');
  }
  refreshState();
  $paused.addEventListener('change', refreshState);
  $exclude.addEventListener('change', refreshState);

  document.getElementById('dash').href = (server || 'http://localhost:4000').replace(/\/$/, '');

  document.getElementById('save').addEventListener('click', async () => {
    const set = new Set(excludedHosts);
    if (host) {
      if ($exclude.checked) set.add(host);
      else set.delete(host);
    }
    await chrome.storage.sync.set({
      paused: $paused.checked,
      excludedHosts: [...set],
      server: $server.value.trim(),
    });
    document.getElementById('saved').textContent = 'Saved — reload the page to apply.';
  });
})();
