const sharp = require('sharp');
const path = require('path');

async function generate() {
  const iconPath = path.join(__dirname, '../assets/images/icon.png');
  const adaptiveIconPath = path.join(__dirname, '../assets/images/adaptive-icon.png');
  const previewCirclePath = path.join(__dirname, '../assets/images/adaptive-icon-circle-preview.png');

  // 1. Extraer el área del logo central de icon.png
  const trimmedBuffer = await sharp(iconPath)
    .extract({ left: 165, top: 207, width: 696, height: 643 })
    .toBuffer();

  // 2. Redimensionar el arte (default 590px para menor alejamiento)
  const targetWidth = parseInt(process.argv[2], 10) || 590;
  const resizedBuffer = await sharp(trimmedBuffer)
    .resize(targetWidth, null, { fit: 'inside' })
    .toBuffer();

  const meta = await sharp(resizedBuffer).metadata();
  const top = Math.round((1024 - meta.height) / 2);
  const left = Math.round((1024 - meta.width) / 2);

  const bgBlue = { r: 0, g: 96, b: 192, alpha: 1 };

  const fs = require('fs');

  // 3. Crear adaptive-icon.png con fondo completo #0060c0
  const finalAdaptiveBuffer = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: bgBlue
    }
  })
    .composite([{ input: resizedBuffer, top, left }])
    .png()
    .toBuffer();

  fs.writeFileSync(adaptiveIconPath, finalAdaptiveBuffer);

  // 4. Crear simulación circular para previsualización (máscara de launcher Android)
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
