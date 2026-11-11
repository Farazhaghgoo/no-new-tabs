// Automated end-to-end test for NUTS.
// Usage: node test/run.mjs [--headed] [--verbose]
//
// Starts the test server, launches Chrome with a throwaway profile, loads the
// extension, and clicks every trick on the test page twice: once with the
// switch OFF (to prove the trick works) and once ON (to prove it is blocked).
// Talks to Chrome over the DevTools pipe, so it needs no npm packages.
// Set CHROME=/path/to/chrome to pick the browser.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--headed');
const VERBOSE = process.argv.includes('--verbose');
const BRANDING_ONLY = process.argv.includes('--branding-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME,
    join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME=/path/to/chrome.');
  return found;
}

// ------------------------------------------------- DevTools over a pipe

class Cdp {
  constructor(proc) {
    this.toChrome = proc.stdio[3];
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Set();
    let buffer = '';
    proc.stdio[4].on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let end;
      while ((end = buffer.indexOf('\0')) !== -1) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (message.id && this.pending.has(message.id)) {
          const { resolve, reject } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) reject(new Error(`${message.error.message} ${message.error.data || ''}`));
          else resolve(message.result);
        } else {
          for (const handler of this.handlers) handler(message);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    this.toChrome.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 15000);
    });
  }

  on(handler) {
    this.handlers.add(handler);
  }
}

// ------------------------------------------------------------- setup

const server = await startServer(0);
const PORT = server.address().port;
const INDEX = `http://localhost:${PORT}/`;
const AD = `http://127.0.0.1:${PORT}/ad.html`;
const EXTERNAL = `http://127.0.0.1:${PORT}/external.html`;

const profile = mkdtempSync(join(tmpdir(), 'nuts-test-'));
const chrome = spawn(
  findChrome(),
  [
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--window-size=1200,1000',
    ...(HEADED ? [] : ['--headless']),
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);
const cdp = new Cdp(chrome);

async function cleanup() {
  try {
    await cdp.send('Browser.close');
  } catch {}
  chrome.kill();
  server.close();
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(300);
    }
  }
}

async function targets(type) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  return targetInfos.filter((t) => t.type === type);
}

async function attach(targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  return sessionId;
}

async function evaluate(sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: ROOT });

let worker;
for (let i = 0; i < 50 && !worker; i++) {
  worker = (await targets('service_worker')).find((t) => t.url.startsWith(`chrome-extension://${extensionId}/`));
  if (!worker) await sleep(100);
}
if (!worker) throw new Error('Extension service worker did not start');
const sw = await attach(worker.targetId);

// Log every top-level commit, to explain failures.
const log = [];
await cdp.send('Runtime.enable', {}, sw);
cdp.on((m) => {
  if (m.sessionId === sw && m.method === 'Runtime.consoleAPICalled') {
    log.push(m.params.args.map((a) => a.value).join(' '));
  }
});
await evaluate(
  sw,
  `chrome.webNavigation.onCommitted.addListener((d) => d.frameId === 0 &&
     console.log('commit', d.transitionType, JSON.stringify(d.transitionQualifiers), d.url)); true`,
);

const mainTab = (await targets('page'))[0];
const page = await attach(mainTab.targetId);

const setEnabled = (on) => evaluate(sw, `chrome.storage.local.set({ enabled: ${on} }).then(() => true)`);
const badge = () => evaluate(sw, `chrome.action.getBadgeText({})`);

async function tabUrl() {
  const { targetInfo } = await cdp.send('Target.getTargetInfo', { targetId: mainTab.targetId });
  return targetInfo.url;
}

async function closeOtherTabs() {
  for (const t of await targets('page')) {
    if (t.targetId !== mainTab.targetId) await cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
  }
}

async function open(url) {
  await cdp.send('Page.navigate', { url, transitionType: 'typed' }, page);
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const ready = await evaluate(page, 'document.readyState').catch(() => '');
    if (ready === 'complete') break;
  }
}

async function mouseClick(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page);
}

async function click(selector) {
  const { x, y } = await evaluate(
    page,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`,
  );
  await mouseClick(x, y);
}

// Buttons inside the cross-site iframe sit at fixed spots (see frame.html).
async function clickInFrame(top) {
  for (let i = 0; i < 50 && !(await evaluate(page, 'window.frameReady === true')); i++) await sleep(100);
  const { x, y } = await evaluate(
    page,
    `(() => {
      const f = document.getElementById('frame');
      f.scrollIntoView({ block: 'center' });
      const r = f.getBoundingClientRect();
      return { x: r.x + 1 + 160, y: r.y + 1 + ${top} + 22 };
    })()`,
  );
  // The browser hit-tests clicks into another site's frame from the last
  // painted frame, so let the scroll paint first.
  await sleep(500);
  await mouseClick(x, y);
}

// ------------------------------------------------------------- cases
//
// kind:
//   tab       OFF opens a tab;            ON opens none and the page stays
//   leave     OFF the tab goes to the ad; ON the page stays
//   tabunder  OFF does both;              ON neither
//   allow     both: the tab ends up on `expect`

const CASES = [
  { name: 'window.open()', kind: 'tab', act: () => click('#popup') },
  { name: 'window.open() noopener', kind: 'tab', act: () => click('#popup-noopener') },
  { name: 'link target=_blank', kind: 'tab', act: () => click('#blank-link') },
  { name: 'delayed window.open()', kind: 'tab', act: () => click('#delayed-popup') },
  { name: 'popup from iframe', kind: 'tab', act: () => clickInFrame(10) },
  { name: 'tab-under', kind: 'tabunder', act: () => click('#tab-under') },
  { name: 'location.href = ad', kind: 'leave', act: () => click('#redirect') },
  { name: 'location.replace(ad)', kind: 'leave', act: () => click('#replace') },
  { name: 'script clicks hidden link', kind: 'leave', act: () => click('#script-link') },
  { name: 'script submits form', kind: 'leave', act: () => click('#form-submit') },
  { name: 'delayed redirect', kind: 'leave', act: () => click('#timer-redirect') },
  { name: 'iframe redirects top', kind: 'leave', act: () => clickInFrame(64) },
  { name: 'same-site link, server forwards', kind: 'leave', act: () => click('#go-link') },
  { name: 'redirect as page loads', kind: 'leave', start: `http://localhost:${PORT}/instant.html` },
  { name: 'meta refresh', kind: 'leave', start: `http://localhost:${PORT}/refresh` },
  { name: 'script, same site', kind: 'allow', expect: `http://localhost:${PORT}/next.html`, act: () => click('#same-site') },
  { name: 'real link, other site', kind: 'allow', expect: EXTERNAL, act: () => click('#real-link') },
  { name: 'real link that bounces', kind: 'allow', expect: `http://[::1]:${PORT}/external.html`, act: () => click('#out-link') },
];

// Compare pages, not query strings: a GET form adds "?" to the ad's URL.
const strip = (u) => {
  try {
    const url = new URL(u);
    return url.origin + url.pathname;
  } catch {
    return u;
  }
};

async function runCase(c) {
  await closeOtherTabs();
  if (c.start) await open(INDEX); // land on the site first, like a real visit
  log.length = 0;
  const start = c.start || INDEX;
  await open(start);
  if (c.act) await c.act();
  await sleep(1800);
  const url = await tabUrl();
  const newTabs = (await targets('page')).length - 1;
  return { url, newTabs, stayed: strip(url) === strip(start), atAd: strip(url) === strip(AD), log: [...log] };
}

function judge(c, on, r) {
  if (c.kind === 'allow') return strip(r.url) === strip(c.expect) && r.newTabs === 0;
  if (on) return r.stayed && r.newTabs === 0;
  if (c.kind === 'tab') return r.newTabs >= 1;
  if (c.kind === 'leave') return r.atAd;
  return r.newTabs >= 1 && r.atAd; // tabunder
}

function describe(r) {
  const where = r.stayed ? 'stayed' : r.atAd ? 'went to ad' : `at ${r.url}`;
  return `${where}, ${r.newTabs} new tab${r.newTabs === 1 ? '' : 's'}`;
}

// --------------------------------------------------------------- run

let failures = 0;
const rows = [];

async function checkBranding() {
  const check = (name, ok) => {
    rows.push([name, '-', ok ? 'verified' : 'failed', ok ? 'PASS' : 'FAIL']);
    if (!ok) failures++;
  };
  const screenshots = join(ROOT, 'artifacts', 'checks');
  mkdirSync(screenshots, { recursive: true });
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, page);
    writeFileSync(join(screenshots, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const phase = () => evaluate(page, 'document.querySelector("nuts-activation")?.dataset.phase || "none"');
  const waitPhase = async (wanted) => {
    for (let i = 0; i < 100; i++) {
      if (await phase() === wanted) return true;
      await sleep(30);
    }
    return false;
  };
  await open(INDEX);
  check('no animation on page load', await phase() === 'none');
  const tabId = await evaluate(sw, `(async () => (await chrome.tabs.query({})).find(t => t.url === ${JSON.stringify(INDEX)}).id)()`);
  await evaluate(sw, `toggle({id:${tabId}}).then(() => true)`);
  check('activation reaches blocking pose', await waitPhase('block'));
  await shot('activation-block');
  check('activation reaches heart eyes', await waitPhase('hearts'));
  await shot('activation-hearts');
  check('activation cleans itself up', await waitPhase('none'));
  // Turning off mid-sequence must remove the overlay, even while assets load.
  await evaluate(sw, `toggle({id:${tabId}}).then(() => toggle({id:${tabId}})).then(() => true)`);
  await waitPhase('approach');
  await evaluate(sw, 'toggle().then(() => true)');
  check('OFF cancels animation', await waitPhase('none'));
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, page);
  await evaluate(sw, `toggle({id:${tabId}}).then(() => true)`);
  check('reduced motion quiet confirmation', await waitPhase('quiet'));
  check('reduced motion cleanup', await waitPhase('none'));
  await evaluate(sw, 'toggle().then(() => true)');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, page);
  await evaluate(sw, `Promise.all([toggle({id:${tabId}}),toggle({id:${tabId}})]).then(() => true)`);
  check('rapid toggle ends OFF', await evaluate(sw, 'isEnabled()') === false);
  await sleep(300);
  check('rapid toggle leaves no overlay', await phase() === 'none');
  await open(pathToFileURL(join(ROOT, 'preview.html')).href);
  check('offline preview images load', await evaluate(page, 'Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)'));
  await shot('preview-desktop');
  await evaluate(page, 'document.getElementById("replay").click(); true');
  check('offline preview plays', await waitPhase('block'));
  await waitPhase('none');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, page);
  await sleep(100);
  check('mobile preview has no overflow', await evaluate(page, 'document.documentElement.scrollWidth <= innerWidth'));
  await shot('preview-mobile');
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, page);
}

try {
  // The toolbar button: toggle() is what a click on the icon runs.
  let before = await badge();
  for (let i = 0; i < 30 && before === ''; i++) {
    await sleep(100); // the worker draws the badge as it starts
    before = await badge();
  }
  // Wait up to 3 s for the expected badge, then make sure it stays: a late
  // redraw must not flip it back.
  const settledBadge = async (expected) => {
    let text = await badge();
    for (let i = 0; i < 30 && text !== expected; i++) {
      await sleep(100);
      text = await badge();
    }
    await sleep(500);
    return badge();
  };
  await evaluate(sw, 'toggle().then(() => true)');
  const afterOn = await settledBadge('ON');
  await evaluate(sw, 'toggle().then(() => true)');
  const afterOff = await settledBadge('OFF');
  const toggleOk = before === 'OFF' && afterOn === 'ON' && afterOff === 'OFF';
  if (!toggleOk) failures++;
  console.log(`Toolbar toggle: badge ${before} -> ${afterOn} -> ${afterOff}  ${toggleOk ? 'PASS' : 'FAIL'}\n`);

  if (BRANDING_ONLY) {
    await checkBranding();
  } else {
  const results = { off: [], on: [] };
  for (const mode of ['off', 'on']) {
    await setEnabled(mode === 'on');
    for (const c of CASES) results[mode].push(await runCase(c));
  }

  for (const [i, c] of CASES.entries()) {
    const off = results.off[i];
    const on = results.on[i];
    const offOk = judge(c, false, off);
    const onOk = judge(c, true, on);
    // OFF failing means the trick itself did not work in this browser, so the
    // ON result proves nothing for that case.
    const verdict = onOk ? (offOk ? 'PASS' : 'PASS?') : 'FAIL';
    if (!onOk) failures++;
    rows.push([c.name, describe(off), describe(on), verdict]);
    if (!onOk || !offOk || VERBOSE) {
      for (const [mode, r] of [['OFF', off], ['ON', on]]) {
        if (r.log.length) console.log(`  [${c.name} / ${mode}]\n    ${r.log.join('\n    ')}`);
      }
    }
  }

  // A tab the user opens from the browser (like Ctrl+T) must survive.
  await setEnabled(true);
  await closeOtherTabs();
  const { targetId } = await cdp.send('Target.createTarget', { url: INDEX });
  await sleep(1500);
  const survived = (await targets('page')).some((t) => t.targetId === targetId);
  if (!survived) failures++;
  rows.push(['tab opened by the browser', '-', survived ? 'kept open' : 'closed', survived ? 'PASS' : 'FAIL']);

  rows.push(['badge after the ON run', '-', `"${await badge()}"`, '']);
  }
} finally {
  await cleanup();
}

const HEAD = ['Case', 'OFF (trick works?)', 'ON (blocked?)', ''];
const widths = HEAD.map((_, i) => Math.max(...[HEAD, ...rows].map((r) => String(r[i]).length)));
const line = (r) => r.map((cell, i) => String(cell).padEnd(widths[i])).join('  ');
console.log(line(HEAD));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
