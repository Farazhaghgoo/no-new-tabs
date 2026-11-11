// No New Tabs: background service worker.
//
// The worker is started and stopped by the browser at will, so nothing
// important lives only in a variable. The on/off switch is kept in
// chrome.storage.local (survives restarts) and per-session data in
// chrome.storage.session (cleared when the browser closes).

importScripts('site.js');

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

  const icon = enabled ? 'on' : 'off';
  await chrome.action.setIcon({
    path: { 16: `icons/${icon}-16.png`, 32: `icons/${icon}-32.png` },
  });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? COLOR_ON : COLOR_OFF });
  await chrome.action.setTitle({
    title: enabled
      ? `No New Tabs is ON (${blocked} blocked). Click to turn off.`
      : 'No New Tabs is OFF. Click to turn on.',
  });
}

async function toggle() {
  const enabled = !(await isEnabled());
  await chrome.storage.session.set({ blocked: 0 });
  await chrome.storage.local.set({ enabled });
}

chrome.action.onClicked.addListener(toggle);

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'local' && 'enabled' in changes) || (area === 'session' && 'blocked' in changes)) {
    render();
  }
});

chrome.runtime.onInstalled.addListener(render);
chrome.runtime.onStartup.addListener(render);

// --------------------------------------------- messages from the pages

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !message) return;
  if (message.type === 'blocked-redirect') countBlocked();
});

// ------------------------------------------------- tabs opened by pages

// Fires when a page makes a new tab or window: window.open, target="_blank",
// popunders from iframes. It does not fire for Ctrl+T, bookmarks or the
// address bar, so those keep working while the switch is on.
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if (!(await isEnabled())) return;
  closeTab(details.tabId);
});

async function closeTab(tabId, attempt = 0) {
  try {
    await chrome.tabs.remove(tabId);
    countBlocked();
  } catch (error) {
    // Chrome refuses tab edits while the user is dragging a tab: retry shortly.
    if (attempt < 5 && /cannot be edited/i.test(String(error && error.message))) {
      setTimeout(() => closeTab(tabId, attempt + 1), 100);
    }
    // Any other error means the tab is already gone.
  }
}
