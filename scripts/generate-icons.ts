import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const publicDir = path.resolve(__dirname, '../public');
const iconsDir = path.resolve(publicDir, 'icons');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

function renderRupeeIcon(size: number, isMaskable = false): Buffer {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;

  // Scale factors
  const scale = isMaskable ? 0.24 : 0.32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Squircle shape if not maskable
      if (!isMaskable) {
        const dx = Math.abs(x - center) / (size * 0.46);
        const dy = Math.abs(y - center) / (size * 0.46);
        const inShape = Math.pow(dx, 4) + Math.pow(dy, 4) <= 1;
        if (!inShape) {
          png.data[idx + 3] = 0;
          continue;
        }
      }

      // Emerald to Teal Gradient Background
      const t = (x + y) / (size * 2);
      const bgR = Math.round(5 + (13 - 5) * t);
      const bgG = Math.round(150 + (148 - 150) * t);
      const bgB = Math.round(105 + (136 - 105) * t);

      // Normalized coordinates relative to center
      const nx = (x - center) / (size * scale);
      const ny = (y - center) / (size * scale);

      let isWhite = false;

      // Top horizontal bar
      if (ny >= -0.85 && ny <= -0.65 && nx >= -0.7 && nx <= 0.7) isWhite = true;

      // Second horizontal bar
      if (ny >= -0.55 && ny <= -0.35 && nx >= -0.7 && nx <= 0.7) isWhite = true;

      // Vertical stem
      if (ny >= -0.85 && ny <= 0.1 && nx >= -0.45 && nx <= -0.25) isWhite = true;

      // Upper curve (D-loop of Rupee)
      const loopCenterY = -0.22;
      const loopCenterX = -0.25;
      const ldx = nx - loopCenterX;
      const ldy = ny - loopCenterY;
      const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
      if (ldx >= 0 && ldist >= 0.28 && ldist <= 0.50 && ny >= -0.65 && ny <= 0.2) isWhite = true;

      // Diagonal leg
      if (ny >= 0.05 && ny <= 0.85) {
        const legX = -0.25 + (ny - 0.05) * 0.95;
        if (nx >= legX - 0.11 && nx <= legX + 0.11) isWhite = true;
      }

      if (isWhite) {
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      } else {
        png.data[idx] = bgR;
        png.data[idx + 1] = bgG;
        png.data[idx + 2] = bgB;
        png.data[idx + 3] = 255;
      }
    }
  }

  return PNG.sync.write(png);
}

// Generate icons
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), renderRupeeIcon(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), renderRupeeIcon(512));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable.png'), renderRupeeIcon(512, true));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), renderRupeeIcon(180));
fs.writeFileSync(path.join(iconsDir, 'shortcut-host.png'), renderRupeeIcon(96));
fs.writeFileSync(path.join(iconsDir, 'shortcut-join.png'), renderRupeeIcon(96));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderRupeeIcon(180));

// Generate SVG Icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="splitPayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#0d9488" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#splitPayGrad)" />
  <g fill="#ffffff" transform="translate(140, 110)">
    <!-- Top bar -->
    <rect x="0" y="20" width="232" height="36" rx="10" />
    <!-- Mid bar -->
    <rect x="0" y="80" width="232" height="36" rx="10" />
    <!-- Vertical stem -->
    <rect x="40" y="20" width="36" height="150" rx="10" />
    <!-- Curve -->
    <path d="M 76 80 Q 180 80 180 150 Q 180 210 76 210 L 76 174 Q 144 174 144 148 Q 144 116 76 116 Z" />
    <!-- Diagonal Leg -->
    <path d="M 80 190 L 190 320 L 140 320 L 40 200 Z" />
  </g>
</svg>`;
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

console.log('SplitPay PWA & Home Screen Icons generated successfully!');
