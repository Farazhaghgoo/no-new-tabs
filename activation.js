// Top-frame, isolated-world receiver. No page-provided messages trigger it.
(() => {
  if (window !== window.top) return;
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'nuts-activate') return;
    chrome.storage.local.get({ enabled: false }).then(({ enabled }) => {
      if (enabled) NutsAnimation.play({ assetURL: (path) => chrome.runtime.getURL(path) });
    });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled?.newValue === false) NutsAnimation.stop();
  });
})();
