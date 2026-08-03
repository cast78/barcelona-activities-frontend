const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../public/pwa-icon.png');

// --- 1. Generar badge-icon.png (blanco sobre transparente, 96x96) ---
sharp(src)
  .resize(96, 96)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 230 && g > 230 && b > 230) {
        data[i + 3] = 0;
      } else {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
    return sharp(Buffer.from(data), {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png().toFile(path.join(__dirname, '../public/badge-icon.png'));
  })
  .then(() => console.log('✅ badge-icon.png generado'))
  .catch(err => console.error('Error badge:', err));

// --- 2. Generar favicon.ico (16, 32, 48px) ---
Promise.all([16, 32, 48].map(size =>
  sharp(src).resize(size, size).png().toBuffer()
))
  .then(buffers => toIco(buffers))
  .then(ico => {
    fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), ico);
    console.log('✅ favicon.ico generado (16/32/48px)');
  })
  .catch(err => console.error('Error favicon:', err));

// --- 3. Generar favicon-192.png (múltiplo de 48 para Google) ---
sharp(src)
  .resize(192, 192)
  .png()
  .toFile(path.join(__dirname, '../public/favicon-192.png'))
  .then(() => console.log('✅ favicon-192.png generado'))
  .catch(err => console.error('Error favicon-192:', err));
