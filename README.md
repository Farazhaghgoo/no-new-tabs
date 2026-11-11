<p align="center">
  <img src="assets/brand/nuts-logo-640.png" width="300" alt="The NUTS squirrel offering you an acorn while pushing an ad window away">
</p>

<h1 align="center">NUTS</h1>

<p align="center"><b>N</b>o <b>U</b>nwanted <b>T</b>abs or <b>S</b>waps: for streaming sites that drive you nuts.<br>
with the hottest mascot EVERRRR!!!!</p>

A Chrome extension with one switch. While it is **on**, web pages cannot open new tabs or windows, and cannot swap your current tab for another site.

It is meant for sites, like some streaming sites, where every click first opens an ad in a new tab or redirects you to one. Ad blockers often miss these, because the ad opens from a real click and the browser treats it as something you asked for. This extension doesn't try to recognise ads: while it's on, it blocks all of these tabs and redirects.

Turn it on when you visit such a site and off when you leave.

## Meet the bouncer

NUTS comes with a squirrel bouncer: soft welcome, strong boundaries.

| Where | What you see |
|---|---|
| Toolbar, switch on | <img src="icons/on-32.png" width="24" alt=""> Happy squirrel on green |
| Toolbar, switch off | <img src="icons/off-32.png" width="24" alt=""> Sad squirrel on grey |
| Extensions page and menus | <img src="icons/logo-48.png" width="24" alt=""> The happy face |
| Turning it on | A 2.6-second animation in the corner of the page |

When you switch NUTS on from the toolbar, the squirrel walks in, pushes an ad window away, offers you an acorn and briefly gets heart eyes. It is silent, lets clicks through to the page, and closes itself; Escape or its × button closes it early, and switching off cancels it. If your system asks for reduced motion, you get a short "NUTS protection is on" note instead. It never plays on page loads or for each blocked ad.

Chrome's own pages (like `chrome://` pages and the Web Store) can't show the animation, but the switch still works there.

To see the artwork and animation without installing anything, open `preview.html` in Chrome and click **Turn on the charm**.

## Install

1. Download this repository (Code → Download ZIP, then unzip it) or clone it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder that contains `manifest.json`.
5. Pin the extension: click the puzzle-piece icon in the toolbar, then the pin next to **NUTS: No Unwanted Tabs or Swaps**.
6. Reload any tabs that were already open, so the extension can run in them.

It should also work in Edge, Brave and other Chromium browsers (at `edge://extensions`, `brave://extensions`, and so on), but it has only been tested in Chrome.

## Use

Click the toolbar icon to switch it on or off.

| Icon | Badge | Meaning |
|---|---|---|
| Happy, green | `ON` | On. Nothing blocked yet since you switched it on. |
| Happy, green | a number | On. That many tabs and redirects were blocked. |
| Sad, grey | `OFF` | Off. Pages behave normally. |

The switch stays as you left it after Chrome restarts.

## What it blocks while on

**New tabs and windows opened by a page:**

- `window.open()`, including popunders and popups opened a moment after a click
- links with `target="_blank"`
- tab-unders, where the page opens a copy of itself in a new tab and sends your tab to the ad
- popups opened from inside an embedded player (an iframe from another site)

**Your tab being sent to another site:**

- script redirects: `location.href = ...`, `location.replace(...)`, delayed redirects
- a script clicking a hidden link or submitting a hidden form
- pages that redirect as they load, including `<meta http-equiv="refresh">`
- an embedded player telling the whole tab to go to an ad
- a link on the same site that the server forwards to another site

## What keeps working

- Tabs you open yourself from the browser: Ctrl+T, bookmarks, the address bar.
- Moving around the same site, by your clicks or by its scripts.
- Real links you click that go to another site, including links that bounce through a redirect (like a link shortener).
- Back, forward and reload.

## Limits

- **Your own new tabs from a page are closed too.** Middle-click, Ctrl+click and "Open link in new tab" look the same to Chrome as a page opening a tab. That is why there is a switch.
- **Some redirects show the ad for a moment.** When the embedded player or the site's server does the redirect, the ad page starts to load, and then the extension sends the tab back. Other redirects are stopped before they start.
- **A site that moves you to its own mirror domain** (for example `site.to` → `site2.to`) looks the same as a redirect to an ad. Switch it off for that step.
- **A link swapped under your cursor gets through.** If a page changes a real link's address just before you click it, the click counts as yours.
- **The first click may do nothing.** The ad overlay often catches it, so you may need to click play twice.
- **"Sign in with Google" and similar buttons** often fail while it is on, because they open a popup or redirect to another site from a script.
- **Tabs that were open before you installed the extension** need a reload before it can guard them.

## How it works

| File | Role |
|---|---|
| `manifest.json` | Manifest V3. Permissions: `storage`, `webNavigation`, and access to all sites so the guard can run in pages. |
| `background.js` | The switch and badge. Closes tabs that pages open (`webNavigation.onCreatedNavigationTarget`). Sends the tab back when a redirect slips past the page guard. |
| `content.js` | Runs at the start of every page. In the top frame, it cancels page-started navigations to another site through the [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API)'s `navigate` event. In every frame, it tells the background which real links you click, so your own clicks are never blocked. |
| `site.js` | Decides whether two addresses are the same site (so `www.example.com` and `player.example.com` count as one). |
| `icons/` | Toolbar faces (`on-*`, `off-*`) and the app icon (`logo-*`). |
| `animation.js`, `activation.js` | The switch-on animation, and the receiver that plays it in the tab where you clicked the toolbar. |
| `assets/` | The full-body logo and social preview (`brand/`), animation poses (`animation/`) and the generated source sheets (`source/`). See [`assets/brand/ARTWORK.md`](assets/brand/ARTWORK.md). |
| `tools/` | `make-icons.mjs` re-exports every icon and pose from the source sheets (Windows), `make-social-preview.mjs` renders the social preview, `package.ps1` builds a release zip. |
| `preview.html` | Offline artwork gallery and animation preview. |

Nothing is sent anywhere. The extension makes no network requests, and it stores only the switch, the blocked count and, per open tab, the last allowed address, which is cleared when you close the tab or the browser.

## Test it

You need [Node.js](https://nodejs.org) 18 or newer. No packages to install.

Automated test, which runs every trick in a hidden Chrome window with a temporary profile, first with the switch off and then on:

```bash
node test/run.mjs
```

Check activation phases, cancellation, rapid toggles, reduced motion, and desktop/mobile preview rendering:

```bash
node test/run.mjs --branding-only
```

On Windows, package the extension, artwork, source sheets, preview, and tests:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
```

Add `--headed` to watch it, or `--verbose` to print each navigation. If Chrome is somewhere unusual, set `CHROME` to its path.

To try the tricks by hand:

```bash
node test/server.mjs
```

Then open <http://localhost:8787/>. The page has one button per trick, and its "ad" is on `127.0.0.1`, which Chrome treats as a different site.
