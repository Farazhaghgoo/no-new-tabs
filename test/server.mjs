// Local test server for No New Tabs.
// Usage: node test/server.mjs  then open http://localhost:8787/
//
// "localhost" and "127.0.0.1" count as two different sites, so the test page
// on one of them can play the part of an ad on the other. "[::1]" is a third.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'pages');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

// The site that plays the "other" part for a request that came in on host.
function otherHost(host) {
  return host === 'localhost' ? '127.0.0.1' : 'localhost';
}

export function startServer(port = 8787) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const port = url.port ? `:${url.port}` : '';
    const other = `http://${otherHost(url.hostname)}${port}`;
    const headers = { 'Cache-Control': 'no-store' };

    const redirect = (to) => {
      res.writeHead(302, { ...headers, Location: to });
      res.end();
    };

    // A same-site link whose server forwards the click to an ad.
    if (url.pathname === '/go') return redirect(`${other}/ad.html`);
    // A link to another site that bounces once more before landing (like a
    // link shortener). The user chose to leave, so this one is allowed.
    if (url.pathname === '/out') return redirect(`http://[::1]${port}/external.html`);
    // A page that sends itself to an ad with a meta refresh.
    if (url.pathname === '/refresh') {
      res.writeHead(200, { ...headers, 'Content-Type': TYPES['.html'] });
      return res.end(
        `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${other}/ad.html">` +
          `<title>Meta refresh</title><body style="font:15px system-ui;margin:24px">` +
          `<h1>Meta refresh page</h1><p>This page tries to jump to an ad right away. ` +
          `With No New Tabs ON you should stay here.</p><p><a href="/">Back to the test page</a></p>`,
      );
    }

    const file = normalize(join(PAGES, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PAGES)) {
      res.writeHead(403, headers);
      return res.end();
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // No host: listens on IPv4 and IPv6, so localhost, 127.0.0.1 and [::1] all work.
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT || 8787);
  await startServer(port);
  console.log(`Test page: http://localhost:${port}/`);
}
