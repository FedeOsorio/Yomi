const sharp = require('sharp');
const path = require('path');

async function generate() {
  const iconPath = path.join(__dirname, '../assets/images/icon.png');
  const adaptiveIconPath = path.join(__dirname, '../assets/images/adaptive-icon.png');
  const previewCirclePath = path.join(__dirname, '../assets/images/adaptive-icon-circle-preview.png');

  // 1. Obtener color de fondo de las esquinas de icon.png
  const cornerPixels = await sharp(iconPath)
    .extract({ left: 0, top: 0, width: 5, height: 5 })
    .raw()
    .toBuffer();
  const bg = { r: cornerPixels[0], g: cornerPixels[1], b: cornerPixels[2], alpha: 1 };
  const hexBg = '#' + [bg.r, bg.g, bg.b].map(x => x.toString(16).padStart(2, '0')).join('');
  console.log('Detected background color:', hexBg, bg);

  // 2. Recortar bordes uniformes del logo central
  const trimmed = await sharp(iconPath).trim().toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  console.log('Trimmed dimensions:', trimmedMeta.width, trimmedMeta.height);

  // 3. Redimensionar arte para que quepa en la safe zone (ancho ~580-600px)
  const targetWidth = parseInt(process.argv[2], 10) || 570;
  const resizedBuffer = await sharp(trimmed)
    .resize(targetWidth, null, { fit: 'inside' })
    .toBuffer();

  const meta = await sharp(resizedBuffer).metadata();
  const top = Math.round((1024 - meta.height) / 2);
  const left = Math.round((1024 - meta.width) / 2);

  const fs = require('fs');

  // 4. Crear adaptive-icon.png con fondo completo coincidente
  const finalAdaptiveBuffer = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: bg
    }
  })
    .composite([{ input: resizedBuffer, top, left }])
    .png()
    .toBuffer();

  fs.writeFileSync(adaptiveIconPath, finalAdaptiveBuffer);

  // 5. Crear simulación circular para previsualización (máscara de launcher Android)
  const circleMask = Buffer.from(
    '<svg width="1024" height="1024" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="341" fill="white"/></svg>'
  );

  const circlePreviewBuffer = await sharp(finalAdaptiveBuffer)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  fs.writeFileSync(previewCirclePath, circlePreviewBuffer);

  console.log('Adaptive icon and circular preview generated successfully!');
}

generate().catch(console.error);
