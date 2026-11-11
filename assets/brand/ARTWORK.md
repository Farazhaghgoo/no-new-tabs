# NUTS guardian artwork

Approved general logo: `nuts-logo.png` (original transparent character).
Padded square: `nuts-logo-square.png`.
Toolbar: happy/green ON and sad/grey OFF, at 16, 32, 48, 128 and 512 px.
Animation: four transparent 512 px poses, played by `animation.js` with a separate moving ad panel.

The animation is a lightweight sprite sequence with CSS motion, not a rigged 3D model or a rendered video. Open `preview.html` to play it offline.

Artwork was made with the built-in image-generation tool. Production prompt directions:
- Toggle sheet: matching reference squirrel head, happy normal eyes on green at left, sad face on grey at right; two equal cells; transparent outside circles.
- Poses: same squirrel in black sportswear, three equal cells, approaching / muscular stop gesture / leaning forward and offering acorn; no browser panel; transparent background.
- Hearts: preserve pose sheet; replace only rightmost character eyes with coral heart shapes.

Source sheets are in `assets/source/`. `tools/export-brand.ps1` crops cells and resizes them; it does not redraw the generated art.

Chrome API references used for integration:
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage
- https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
