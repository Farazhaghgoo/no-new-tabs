// NUTS: background service worker.
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

// Storage changes can ask for several redraws at once. Running them side by
// side let an older one finish last and leave the badge showing the wrong
// state, so draws run one at a time and the last one reads the final state.
let drawing = null;
let redrawWanted = false;

function render() {
  if (drawing) {
    redrawWanted = true;
    return drawing;
  }
  drawing = (async () => {
    do {
      redrawWanted = false;
      await draw().catch(() => {});
    } while (redrawWanted);
    drawing = null;
  })();
  return drawing;
}

async function draw() {
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
      ? `NUTS is ON (${blocked} blocked). Click to turn off.`
      : 'NUTS is OFF. Click to turn on.',
  });
}

let toggleQueue = Promise.resolve();
function toggle(tab) {
  const next = toggleQueue.then(() => applyToggle(tab));
  toggleQueue = next.catch(() => {});
  return next;
}

async function applyToggle(tab) {
  const enabled = !(await isEnabled());
  await chrome.storage.session.set({ blocked: 0 });
  await chrome.storage.local.set({ enabled });
  // Only a deliberate toolbar activation plays the mascot, in that tab.
  // Restricted pages and tabs awaiting a reload simply have no receiver.
  if (enabled && tab?.id != null) {
    await chrome.tabs.sendMessage(tab.id, { type: 'nuts-activate' }, { frameId: 0 }).catch(() => {});
  }
}

chrome.action.onClicked.addListener(toggle);

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'local' && 'enabled' in changes) || (area === 'session' && 'blocked' in changes)) {
    render();
  }
});

// Draw the button whenever the worker starts, so it is right from the first
// moment after install, update or browser start.
render();

// ---------------------------------------------------- per-tab memory
//
// tab:<id> = {
//   url, site   last page the tab was allowed to be on
//   click       { site, at }  last real link the user clicked in this tab
//   restore     { url, at }   set while the tab is being sent back
//   bounces     [times]       recent send-backs, to stop endless loops
// }

const tabQueues = new Map();

// Runs fn(state) for one tab at a time and saves what it returns.
function withTab(tabId, fn) {
  const key = `tab:${tabId}`;
  const run = (tabQueues.get(tabId) || Promise.resolve())
    .then(async () => {
      const { [key]: state = {} } = await chrome.storage.session.get(key);
      const next = await fn(state);
      if (next) await chrome.storage.session.set({ [key]: next });
    })
    .catch(() => {});
  tabQueues.set(tabId, run);
  return run;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabQueues.delete(tabId);
  chrome.storage.session.remove(`tab:${tabId}`).catch(() => {});
});

chrome.tabs.onReplaced.addListener(async (addedId, removedId) => {
  const old = `tab:${removedId}`;
  const { [old]: state } = await chrome.storage.session.get(old);
  if (state) await chrome.storage.session.set({ [`tab:${addedId}`]: state });
  await chrome.storage.session.remove(old);
});

// --------------------------------------------- messages from the pages

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !message) return;
  if (message.type === 'blocked-redirect') countBlocked();
  if (message.type === 'user-nav') {
    const site = NutsSite.of(message.url);
    if (site) withTab(tabId, (state) => ({ ...state, click: { site, at: Date.now() } }));
  }
});

// ---------------------------------------- redirects the page guard misses
//
// The page guard cannot see two kinds of redirect:
//   - a cross-site iframe (often the video player) doing top.location = ad
//   - a link on the same site whose server forwards to another site
// Both commit as a normal top-level navigation. If the tab lands on another
// site and the user did not click a real link there, send it back.

const CLICK_WINDOW = 10_000;
const RESTORE_WINDOW = 5_000;
const BOUNCE_WINDOW = 10_000;
const MAX_BOUNCES = 3;

// Navigations the page can cause. Everything else (typed URL, bookmark,
// reload, start page, ...) comes from the browser itself.
const PAGE_TRANSITIONS = new Set(['link', 'form_submit']);

function withoutHash(url) {
  const i = url.indexOf('#');
  return i === -1 ? url : url.slice(0, i);
}

async function sendBack(tabId, url, direct) {
  if (!direct) {
    try {
      await chrome.tabs.goBack(tabId); // keeps the old page's state when it can
      return;
    } catch {
      // No history entry to go back to: load the page instead.
    }
  }
  chrome.tabs.update(tabId, { url }).catch(() => {});
}

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  if (d.documentLifecycle && d.documentLifecycle !== 'active') return; // prerender

  withTab(d.tabId, async (state) => {
    const now = Date.now();
    const site = NutsSite.of(d.url);
    const qualifiers = d.transitionQualifiers || [];
    const accept = () => ({ url: d.url, site, bounces: state.bounces || [] });

    // While sending a tab back, the first step is goBack. If that lands on a
    // different page than the one we left (the redirect had replaced it),
    // load the right page directly.
    const restore = state.restore && now - state.restore.at < RESTORE_WINDOW ? state.restore : null;
    if (restore) {
      if (withoutHash(d.url) === withoutHash(restore.url)) return accept();
      if (qualifiers.includes('forward_back')) {
        sendBack(d.tabId, restore.url, true);
        return state;
      }
    }

    if (!state.site || !site || site === state.site) return accept();
    if (!(await isEnabled())) return accept();
    if (qualifiers.includes('from_address_bar') || qualifiers.includes('forward_back')) return accept();
    if (!PAGE_TRANSITIONS.has(d.transitionType)) return accept();

    // The user clicked a real link to this site, or a link that already
    // pointed away from the old site (so following its redirects is fine).
    const click = state.click && now - state.click.at < CLICK_WINDOW ? state.click : null;
    if (click && (click.site === site || click.site !== state.site)) return accept();

    const bounces = (state.bounces || []).filter((t) => now - t < BOUNCE_WINDOW);
    if (bounces.length >= MAX_BOUNCES) return accept(); // give up rather than loop

    countBlocked();
    sendBack(d.tabId, state.url, Boolean(restore));
    return { ...state, click: null, bounces: [...bounces, now], restore: { url: state.url, at: now } };
  });
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
