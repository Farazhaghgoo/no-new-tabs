// Renders tools/social-preview.html to assets/brand/social-preview.png
// (1280x640, the size GitHub uses for a repository's social preview).
// Usage: node tools/make-social-preview.mjs   (set CHROME to pick the browser)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const page = fileURLToPath(new URL('./social-preview.html', import.meta.url));
const out = fileURLToPath(new URL('../assets/brand/social-preview.png', import.meta.url));

const chrome = [
  process.env.CHROME,
  join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!chrome) throw new Error('Chrome not found. Set CHROME=/path/to/chrome.');

const profile = mkdtempSync(join(tmpdir(), 'nuts-social-'));
const result = spawnSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--user-data-dir=${profile}`,
  '--window-size=1280,640',
  `--screenshot=${out}`,
  pathToFileURL(page).href,
], { stdio: 'ignore' });
rmSync(profile, { recursive: true, force: true });
if (result.status !== 0 || !existsSync(out)) throw new Error('Chrome could not render the preview.');
console.log(`Wrote ${out}`);
