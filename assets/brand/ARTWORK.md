# NUTS artwork

## Where each asset is used

| Asset | Used for | Why |
|---|---|---|
| `nuts-logo.png` (full-body squirrel, 1254 px) | Master copy of the brand image | Original transparent character. Edit from this. |
| `nuts-logo-640.png` | README hero, social preview, `preview.html` | Same image, small enough for web pages and the release zip. |
| `nuts-logo-square.png` | Avatars and other square crops | The master with transparent padding. |
| `social-preview.png` (1280×640) | GitHub repository social preview, link shares | Logo plus name and pitch; rendered by `tools/make-social-preview.mjs`. |
| `icons/on-16.png`, `on-32.png` | Toolbar while the switch is on | Happy face cropped to the green disc, so it stays readable at 16 px. |
| `icons/off-16.png`, `off-32.png` | Toolbar while the switch is off | Sad face cropped to the grey disc. |
| `icons/logo-16.png` to `logo-128.png` | App icon: extensions page, menus, Web Store | Happy face. The full-body logo is unreadable below 128 px. The 128 px file has the Web Store's 16 px padding. |
| `icons/on-*`, `off-*` at 48, 128, 512 px | Preview page, future store art | Faces with ears, uncropped. |
| `assets/animation/*.png` (4 poses, 512 px) | Switch-on animation | Played by `animation.js` with a separate moving ad panel. |

The animation is a lightweight sprite sequence with CSS motion, not a rigged 3D model or a rendered video. Open `preview.html` to play it offline.

Artwork was made with the built-in image-generation tool. Production prompt directions:
- Toggle sheet: matching reference squirrel head, happy normal eyes on green at left, sad face on grey at right; two equal cells; transparent outside circles.
- Poses: same squirrel in black sportswear, three equal cells, approaching / muscular stop gesture / leaning forward and offering acorn; no browser panel; transparent background.
- Hearts: preserve pose sheet; replace only rightmost character eyes with coral heart shapes.

Source sheets are in `assets/source/`. `tools/export-brand.ps1` crops cells and resizes them; it does not redraw the generated art.

Chrome API references used for integration:
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage
- https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
