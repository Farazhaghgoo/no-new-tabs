// NUTS: content script. Runs in every frame at document_start.
//
// 1. In the top frame it cancels navigations that the page starts by itself
//    (location.href = ..., location.replace, form.submit, meta refresh,
//    link.click() from a script) when they would leave the current site.
// 2. In every frame it tells the background worker where the user really
//    clicked, so the worker can tell your own link clicks from hijacks.

(() => {
  // Run once per page, even if the extension adds this script to a tab that
  // already has it (see sendToPage in background.js).
  if (globalThis.__nutsContent) return;
  globalThis.__nutsContent = true;

  // null until the stored switch has been read (takes a few milliseconds).
  let enabled = null;

  chrome.storage.local
    .get({ enabled: false })
    .then((stored) => {
      if (enabled === null) enabled = stored.enabled === true;
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'enabled' in changes) enabled = changes.enabled.newValue === true;
  });

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // The extension was reloaded; this old script is orphaned.
    }
  }

  // ---------------------------------------- where the user really clicked

  function report(url) {
    if (enabled && /^https?:/i.test(url)) send({ type: 'user-nav', url });
  }

  addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted) return;
      for (const node of event.composedPath()) {
        if (node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) {
          if (node.href) report(node.href);
          return;
        }
      }
    },
    true,
  );

  addEventListener(
    'submit',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof HTMLFormElement)) return;
      const button = event.submitter;
      report(button && button.hasAttribute('formaction') ? button.formAction : event.target.action);
    },
    true,
  );

  // ------------------------------------------- guard the top-level page

  if (window !== window.top || !window.navigation) return;

  navigation.addEventListener('navigate', (event) => {
    // After NUTS is updated or reloaded, this copy is cut off from the
    // extension and its switch value is stale. Stand down; the fresh copy
    // added to the tab takes over.
    if (!chrome.runtime?.id) return;
    if (enabled === false) return;
    // Real link clicks, form submits by the user, the address bar, back and
    // forward: all fine.
    if (event.userInitiated || !event.cancelable) return;
    if (event.navigationType !== 'push' && event.navigationType !== 'replace') return;

    const to = event.destination.url;
    const here = NutsSite.of(location.href);
    const there = NutsSite.of(to);
    if (!here || !there || here === there) return;

    if (enabled === null) {
      // The switch has not been read yet. A form POST cannot be replayed, so
      // leave it to the background worker's backstop; anything else is held
      // and replayed if the switch turns out to be off.
      if (event.formData) return;
      event.preventDefault();
      const replace = event.navigationType === 'replace';
      chrome.storage.local.get({ enabled: false }).then((stored) => {
        enabled = stored.enabled === true;
        if (enabled) send({ type: 'blocked-redirect', url: to });
        else if (replace) location.replace(to);
        else location.assign(to);
      });
      return;
    }

    event.preventDefault();
    send({ type: 'blocked-redirect', url: to });
  });
})();
