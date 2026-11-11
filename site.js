// Shared by the content script and the background worker.
//
// siteOf() reduces a URL to its "site" (roughly the registrable domain), so
// that www.example.com and player.example.com count as the same place while
// ads.other.com does not. A full public-suffix list is overkill here; the
// common two-part country suffixes (co.uk, com.br, ...) are handled.

/* exported NoNewTabsSite */
var NoNewTabsSite = (() => {
  const SECOND_LEVEL = new Set(['ac', 'co', 'com', 'edu', 'gob', 'gov', 'mil', 'ne', 'net', 'or', 'org']);

  function of(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return '';
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return '';
    if (/^[\d.]+$/.test(host) || host.startsWith('[')) return host; // IP address
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const twoPart = parts.at(-1).length === 2 && SECOND_LEVEL.has(parts.at(-2));
    return parts.slice(twoPart ? -3 : -2).join('.');
  }

  return { of };
})();
