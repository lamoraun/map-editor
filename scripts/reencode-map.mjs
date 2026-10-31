// Re-encode the images embedded in a .map file's SVG (line 5) to WebP to
// shrink the file size. The bundled map (public/actual.map) embeds ~50 base64
// PNG texture tiles (~20 MB) that compress ~85% as lossy WebP.
//
// Usage:
//   npm install --no-save sharp   # one-time, sharp is not a project dependency
//   node scripts/reencode-map.mjs [input.map] [output.map]
//
// Defaults: input = public/actual.map, output = input (overwrite in place).
// Only replaces an image when the WebP result is smaller; otherwise it keeps
// the original (e.g. already-compressed JPEGs). SVG and existing WebP images
// are left untouched.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp is not installed. Run: npm install --no-save sharp");
  process.exit(1);
}

const SRC = process.argv[2] ?? "public/actual.map";
const DST = process.argv[3] ?? SRC;

if (!existsSync(SRC)) {
  console.error(`File not found: ${SRC}`);
  process.exit(1);
}

const raw = readFileSync(SRC);
const text = raw.toString("utf8");
const sep = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split(sep);

console.log(`Input:  ${SRC} (${raw.length} bytes, ${lines.length} lines)`);

if (lines.length < 6) {
  console.error("Unexpected line count — expected a .map file with the SVG on line 5. Aborting.");
  process.exit(1);
}

const svg = lines[5];
const re = /data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g;

const replacements = [];
let before = 0;
let after = 0;

for (const m of svg.matchAll(re)) {
  const fmt = m[1];
  const buf = Buffer.from(m[2], "base64");

  // vector SVG and already-compressed WebP are left as-is
  if (fmt === "svg+xml" || fmt === "webp") continue;

  try {
    const meta = await sharp(buf).metadata();
    const hasAlpha = meta.hasAlpha === true;
    const outBuf = hasAlpha
      ? await sharp(buf).webp({ quality: 90, alphaQuality: 100 }).toBuffer()
      : await sharp(buf).webp({ quality: 90 }).toBuffer();

    if (outBuf.length >= buf.length) {
      console.log(`  keep    ${fmt} ${meta.width}x${meta.height}  ${buf.length} -> ${outBuf.length} bytes`);
      continue;
    }

    before += buf.length;
    after += outBuf.length;
    console.log(
      `  ${fmt.padEnd(4)} ${String(meta.width).padStart(4)}x${String(meta.height).padStart(4)}` +
        `  ${buf.length} -> ${outBuf.length} bytes  (-${((1 - outBuf.length / buf.length) * 100).toFixed(1)}%)`
    );
    replacements.push({
      index: m.index,
      length: m[0].length,
      replacement: `data:image/webp;base64,${outBuf.toString("base64")}`,
    });
  } catch (err) {
    console.log(`  error   ${fmt} (${buf.length} bytes): ${err.message} — left as-is`);
  }
}

// apply from the end so earlier indices stay valid
replacements.sort((a, b) => b.index - a.index);
let svgOut = svg;
for (const r of replacements) {
  svgOut = svgOut.slice(0, r.index) + r.replacement + svgOut.slice(r.index + r.length);
}
lines[5] = svgOut;

const outBuf = Buffer.from(lines.join(sep), "utf8");
writeFileSync(DST, outBuf);

console.log(
  `Re-encoded ${replacements.length} images: ${before} -> ${after} bytes ` +
    `(-${((1 - after / before) * 100).toFixed(1)}%)`
);
console.log(
  `Output: ${DST} (${outBuf.length} bytes, -${((1 - outBuf.length / raw.length) * 100).toFixed(1)}% vs input)`
);
