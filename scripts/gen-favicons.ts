/**
 * Regenerate raster favicons / PWA icons from the Remiix app icon.
 * Usage: bun run scripts/gen-favicons.ts
 *
 * Browser tab favicons get iOS-like rounded corners (transparent outside).
 * Apple / Android install icons stay full-bleed squares (OS applies the mask).
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const source = readFileSync("static/images/remiix-app-icon.jpg");
const outDir = "static/favicons";

/** ~iOS app-icon corner radius as a fraction of size. */
const FAVICON_CORNER_RATIO = 0.2237;

function roundedMaskSvg(size: number, radius: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>` +
      `</svg>`,
  );
}

async function writePng(name: string, size: number, opts?: { rounded?: boolean }) {
  let pipeline = sharp(source).resize(size, size, { fit: "cover", position: "centre" });

  if (opts?.rounded) {
    const radius = Math.max(1, Math.round(size * FAVICON_CORNER_RATIO));
    const mask = roundedMaskSvg(size, radius);
    pipeline = sharp(
      await pipeline
        .ensureAlpha()
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer(),
    );
  }

  const png = await pipeline.png().toBuffer();
  writeFileSync(join(outDir, name), png);
  console.log(
    "wrote",
    name,
    `${size}x${size}`,
    opts?.rounded ? `rx=${Math.round(size * FAVICON_CORNER_RATIO)}` : "square",
    png.length,
    "bytes",
  );
}

await writePng("favicon-16x16.png", 16, { rounded: true });
await writePng("favicon-32x32.png", 32, { rounded: true });
await writePng("apple-touch-icon.png", 180);
await writePng("android-chrome-192x192.png", 192);
await writePng("android-chrome-512x512.png", 512);
await writePng("favicon-source.png", 1024);

const ico = await pngToIco([
  join(outDir, "favicon-16x16.png"),
  join(outDir, "favicon-32x32.png"),
]);
writeFileSync(join(outDir, "favicon.ico"), ico);
console.log("wrote favicon.ico", ico.length, "bytes");
