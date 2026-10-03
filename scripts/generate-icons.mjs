// Erzeugt die PWA-Icons aus einer gemeinsamen Vektorquelle.
//
// Einmalig:  npm i --no-save sharp
// Dann:      node scripts/generate-icons.mjs
//
// Ergebnis in public/:
//   icon-192.png            Android/Chrome Startbildschirm
//   icon-512.png            Splashscreen, App-Übersicht
//   icon-maskable-512.png   Android adaptive Icons (Inhalt in der sicheren Zone)
//
// apple-touch-icon.png (180) bleibt unangetastet — iOS nutzt weiterhin dieses.

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(OUT, { recursive: true });

const BG = "#0e7490";

/**
 * @param size   Kantenlänge in Pixeln
 * @param maskable  true = Inhalt bleibt in der sicheren Zone (mittlere 80 %),
 *                  damit Android beim Zuschneiden auf Kreis/Squircle nichts abschneidet
 */
function iconSvg(size, maskable) {
  // Verhältnisse aus dem bestehenden 180px-Icon übernommen (66/180 bzw. 120/180),
  // damit das Android-Icon zum vorhandenen iOS-Icon passt.
  const fontRatio = maskable ? 0.22 : 0.3667;
  const baselineRatio = maskable ? 0.579 : 0.6667;
  const fontSize = size * fontRatio;
  const baseline = size * baselineRatio;
  const spacing = -size * 0.011;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="${size / 2}" y="${baseline}"
        font-family="DejaVu Sans, Arial Black, Arial, sans-serif"
        font-weight="bold" font-size="${fontSize}" fill="#ffffff"
        text-anchor="middle" letter-spacing="${spacing}">V17</text>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { file, size, maskable } of targets) {
  const svg = Buffer.from(iconSvg(size, maskable));
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, file));
  console.log(`${file} · ${size}×${size}${maskable ? " · maskable" : ""}`);
}

console.log("Fertig.");
