/**
 * Regenerate raster favicons from the Remiix light icon.
 * Usage: bun run scripts/gen-favicons.ts
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const svg = readFileSync("static/images/remiix-icon-light.svg");
const outDir = "static/favicons";

async function writePng(name: string, size: number) {
  const png = await sharp(svg, { density: Math.max(72, size) })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(join(outDir, name), png);
  console.log("wrote", name, `${size}x${size}`, png.length, "bytes");
}

await writePng("favicon-16x16.png", 16);
await writePng("favicon-32x32.png", 32);
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
