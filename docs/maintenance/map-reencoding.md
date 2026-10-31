# Re-encoding the bundled map

This fork always loads a bundled project map (`public/actual.map`) on startup instead of
generating a random map. That file embeds the map's rendered SVG preview (line 5 of the
`.map` format), which contains ~50 base64-encoded texture images (~20 MB). Re-encoding
those images to WebP shrinks the file by ~45% (31 MB → 17 MB), roughly halving first-load time.

## Why it helps

- The embedded images are mostly ~981×992 PNG tiles with alpha (relief shading). They are
  already PNG-compressed, so gzip alone only reduces the whole file ~43%.
- Lossy WebP (`quality: 90`, `alphaQuality: 100`) re-encodes them ~85% smaller with no
  visible difference for smooth terrain shading.

## How to re-encode

`scripts/reencode-map.mjs` rewrites the images in place:

```sh
npm install --no-save sharp   # one-time; sharp is intentionally not a project dependency
node scripts/reencode-map.mjs public/actual.map
```

Run it whenever `public/actual.map` is replaced with a new map. The script:

- splits the `.map` by its line separator (CRLF or LF) and targets line 5 (the SVG);
- re-encodes `data:image/png` and `data:image/jpeg` to WebP (`quality: 90`,
  `alphaQuality: 100` for images with transparency);
- keeps the original when WebP is not smaller (already-compressed JPEGs, tiny PNGs);
- leaves `svg+xml` and existing `webp` images untouched.

After running, verify with `npm run build` and confirm the map still loads (50 lines, line 0
starting with the version, no broken `<image>` references).

## Loading-side notes

- `public/main.js` fetches `./actual.map` with a progress bar and caches the blob in
  IndexedDB under the `actualMap` key, so repeat visits skip the download.
- The bundled map is version 1.143.0, older than the app (1.143.2), so it is auto-updated
  on every load — expected and idempotent.
