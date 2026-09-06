const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '../assets/images');
const WORDS_DIR = path.join(__dirname, '../assets/images/words');

// Intentar cargar sharp o pngjs como fallback
let sharp = null;
let PNG = null;
try {
  sharp = require('sharp');
} catch {
  try {
    PNG = require('pngjs').PNG;
  } catch {}
}

async function optimizeAppAssets() {
  console.log('🚀 Iniciando optimización de iconos e imágenes de Yomi...\n');

  let totalOriginal = 0;
  let totalOptimized = 0;
  let count = 0;

  // 1. Optimizar iconos y splash en assets/images
  if (fs.existsSync(IMAGES_DIR)) {
    const rootFiles = fs.readdirSync(IMAGES_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      const isFile = fs.statSync(path.join(IMAGES_DIR, f)).isFile();
      return isFile && (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp');
    });

    console.log(`📁 Procesando ${rootFiles.length} imágenes principales en assets/images/...`);

    for (const file of rootFiles) {
      const filePath = path.join(IMAGES_DIR, file);
      const originalBuffer = fs.readFileSync(filePath);
      const originalSize = originalBuffer.length;
      totalOriginal += originalSize;

      let optimizedBuffer = originalBuffer;

      try {
        if (sharp) {
          const ext = path.extname(file).toLowerCase();
          const baseName = path.basename(file, ext).toLowerCase();
          let pipeline = sharp(originalBuffer);

          // Dimensiones estándar óptimas según el tipo de asset
          let targetWidth = null;
          let targetHeight = null;

          if (baseName === 'favicon') {
            targetWidth = 48;
            targetHeight = 48;
          } else if (baseName === 'android-icon-foreground' || baseName === 'splash-icon') {
            targetWidth = 512;
            targetHeight = 512;
          } else if (baseName === 'icon' || baseName === 'adaptive-icon') {
            targetWidth = 1024;
            targetHeight = 1024;
          } else if (baseName === 'splash') {
            targetWidth = 1080;
            targetHeight = 2400;
          }

          if (targetWidth && targetHeight) {
            pipeline = pipeline.resize(targetWidth, targetHeight, {
              fit: 'inside',
              withoutEnlargement: true,
            });
          }

          if (ext === '.png') {
            optimizedBuffer = await pipeline
              .png({
                compressionLevel: 9,
                adaptiveFiltering: true,
                palette: true,
                quality: 90,
                effort: 10,
              })
              .toBuffer();
          } else if (ext === '.webp') {
            optimizedBuffer = await pipeline
              .webp({ quality: 85, effort: 6 })
              .toBuffer();
          }
        } else if (PNG && path.extname(file).toLowerCase() === '.png') {
          const png = PNG.sync.read(originalBuffer);
          optimizedBuffer = PNG.sync.write(png, {
            deflateLevel: 9,
            deflateStrategy: 3,
            filterType: 4,
          });
        }

        if (optimizedBuffer.length < originalSize) {
          fs.writeFileSync(filePath, optimizedBuffer);
          const saved = originalSize - optimizedBuffer.length;
          const pct = ((saved / originalSize) * 100).toFixed(1);
          console.log(`  ✓ ${file}: ${(originalSize / 1024).toFixed(1)} KB ➔ ${(optimizedBuffer.length / 1024).toFixed(1)} KB (-${pct}%)`);
          totalOptimized += optimizedBuffer.length;
        } else {
          console.log(`  ✓ ${file}: ${(originalSize / 1024).toFixed(1)} KB (ya optimizado)`);
          totalOptimized += originalSize;
        }
        count++;
      } catch (err) {
        console.error(`  ❌ Error optimizando ${file}:`, err.message);
        totalOptimized += originalSize;
      }
    }
  }

  // 2. Si existe carpeta words (vocabulario), convertir y optimizar a WebP
  if (fs.existsSync(WORDS_DIR)) {
    const wordFiles = fs.readdirSync(WORDS_DIR);
    console.log(`\n📁 Procesando ${wordFiles.length} imágenes en assets/images/words/...`);

    for (const file of wordFiles) {
      const ext = path.extname(file).toLowerCase();
      const filePath = path.join(WORDS_DIR, file);
      if (!fs.statSync(filePath).isFile()) continue;

      const originalBuffer = fs.readFileSync(filePath);
      const originalSize = originalBuffer.length;
      totalOriginal += originalSize;

      if (sharp && (ext === '.png' || ext === '.jpg' || ext === '.jpeg')) {
        try {
          const fileNameWithoutExt = path.basename(file, ext);
          const webpPath = path.join(WORDS_DIR, `${fileNameWithoutExt}.webp`);

          let pipeline = sharp(originalBuffer);
          try {
            pipeline = pipeline.trim();
          } catch {}

          const optimizedBuffer = await pipeline
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85, effort: 5 })
            .toBuffer();

          fs.writeFileSync(webpPath, optimizedBuffer);
          fs.unlinkSync(filePath);
          totalOptimized += optimizedBuffer.length;

          const saved = originalSize - optimizedBuffer.length;
          const pct = ((saved / originalSize) * 100).toFixed(1);
          console.log(`  ✓ ${file} ➔ ${fileNameWithoutExt}.webp: ${(originalSize / 1024).toFixed(1)} KB ➔ ${(optimizedBuffer.length / 1024).toFixed(1)} KB (-${pct}%)`);
          count++;
        } catch (err) {
          console.error(`  ❌ Error convirtiendo ${file}:`, err.message);
          totalOptimized += originalSize;
        }
      } else {
        totalOptimized += originalSize;
      }
    }
  }

  const totalSaved = totalOriginal - totalOptimized;
  if (totalSaved > 0) {
    console.log(`\n🎉 ¡Optimización finalizada! Se ahorraron ${(totalSaved / 1024).toFixed(1)} KB en total.`);
  } else {
    console.log('\n✨ Todas las imágenes ya están en su tamaño óptimo.');
  }
}

optimizeAppAssets().catch(err => {
  console.error('❌ Error durante la optimización:', err);
  process.exit(1);
});
