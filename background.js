// No New Tabs: background service worker.
//
// The worker is started and stopped by the browser at will, so nothing
// important lives only in a variable. The on/off switch is kept in
// chrome.storage.local (survives restarts) and per-session data in
// chrome.storage.session (cleared when the browser closes).

const COLOR_ON = '#16a34a';
const COLOR_OFF = '#6b7280';

// ---------------------------------------------------------------- state

async function isEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  return enabled;
}

// Storage updates are read-modify-write, so they run one at a time.
let queue = Promise.resolve();

function countBlocked() {
  queue = queue
    .then(async () => {
      const { blocked } = await chrome.storage.session.get({ blocked: 0 });
      await chrome.storage.session.set({ blocked: blocked + 1 });
    })
    .catch(() => {});
}

// ------------------------------------------------------- toolbar button

async function render() {
  const enabled = await isEnabled();
  const { blocked } = await chrome.storage.session.get({ blocked: 0 });

  let text = 'OFF';
  if (enabled) text = blocked === 0 ? 'ON' : blocked > 999 ? '999+' : String(blocked);

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? COLOR_ON : COLOR_OFF });
  await chrome.action.setTitle({
    title: enabled
      ? `No New Tabs is ON (${blocked} blocked). Click to turn off.`
      : 'No New Tabs is OFF. Click to turn on.',
  });
}

chrome.action.onClicked.addListener(async () => {
  const enabled = !(await isEnabled());
  await chrome.storage.session.set({ blocked: 0 });
  await chrome.storage.local.set({ enabled });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'local' && 'enabled' in changes) || (area === 'session' && 'blocked' in changes)) {
    render();
  }
});

chrome.runtime.onInstalled.addListener(render);
chrome.runtime.onStartup.addListener(render);
