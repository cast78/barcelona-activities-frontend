const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '../public/pwa-icon.png');
const dest = path.join(__dirname, '../public/badge-icon.png');

sharp(src)
  .resize(96, 96)
  .greyscale()
  .normalise()
  // Convierte todos los píxeles no transparentes a blanco puro
  .threshold(128)
  .toColourspace('b-w')
  .png()
  .toFile(dest, (err, info) => {
    if (err) console.error('Error:', err);
    else console.log('badge-icon.png generado desde pwa-icon.png:', info);
  });
