// Top-frame, isolated-world receiver. No page-provided messages trigger it.
(() => {
  if (window !== window.top || globalThis.__nutsActivation) return; // run once per page
  globalThis.__nutsActivation = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    if (sender.id !== chrome.runtime.id || (type !== 'nuts-activate' && type !== 'nuts-deactivate')) return;
    // Answer at once, so the extension knows this tab has a live receiver.
    sendResponse({ received: true });
    const wantOn = type === 'nuts-activate';
    chrome.storage.local.get({ enabled: false }).then(({ enabled }) => {
      if (enabled === wantOn) {
        NutsAnimation.play({ mode: wantOn ? 'on' : 'off', assetURL: (path) => chrome.runtime.getURL(path) });
      }
    });
  });
  // The storage event and the message can arrive in either order, so each
  // change only removes the other mode's animation, never the one it caused.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    if (changes.enabled.newValue === false) NutsAnimation.stop({ mode: 'on' });
    else if (changes.enabled.newValue === true) NutsAnimation.stop({ mode: 'off' });
  });
})();
