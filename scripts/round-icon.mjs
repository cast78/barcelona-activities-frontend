import { Jimp } from "jimp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

// Redondea las esquinas de un icono cuadrado y lo guarda como PNG con transparencia.
async function roundIcon(srcName, outName, radiusRatio = 0.2) {
  const src = path.join(publicDir, srcName);
  const out = path.join(publicDir, outName);
  const image = await Jimp.read(src);
  const w = image.width;
  const h = image.height;
  const r = Math.min(w, h) * radiusRatio;

  const cx = w / 2;
  const cy = h / 2;
  const halfW = w / 2 - r;
  const halfH = h / 2 - r;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Distancia con signo a un rectangulo redondeado (centrado)
      const qx = Math.abs(x + 0.5 - cx) - halfW;
      const qy = Math.abs(y + 0.5 - cy) - halfH;
      const ax = Math.max(qx, 0);
      const ay = Math.max(qy, 0);
      const dist = Math.sqrt(ax * ax + ay * ay) - r;

      // coverage con antialiasing de ~1px en el borde
      let coverage = 0.5 - dist;
      if (coverage <= 0) {
        coverage = 0;
      } else if (coverage >= 1) {
        coverage = 1;
      }

      if (coverage < 1) {
        const idx = (y * w + x) * 4;
        image.bitmap.data[idx + 3] = Math.round(
          image.bitmap.data[idx + 3] * coverage
        );
      }
    }
  }

  await image.write(out);
  console.log(`OK ${outName} (${w}x${h}, r=${Math.round(r)})`);
}

await roundIcon("pwa-icon.png", "pwa-icon.png", 0.2);
