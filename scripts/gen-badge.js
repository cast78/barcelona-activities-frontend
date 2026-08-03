const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '../public/pwa-icon.png');
const dest = path.join(__dirname, '../public/badge-icon.png');

sharp(src)
  .resize(96, 96)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Píxeles blancos/casi blancos (fondo) → transparente
      if (r > 230 && g > 230 && b > 230) {
        data[i + 3] = 0;
      } else {
        // Resto (logo) → blanco puro opaco
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
    return sharp(Buffer.from(data), {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png().toFile(dest);
  })
  .then(info => console.log('badge-icon.png generado:', info))
  .catch(err => console.error('Error:', err));
