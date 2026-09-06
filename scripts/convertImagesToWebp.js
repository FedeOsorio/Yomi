const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WORDS_DIR = path.join(__dirname, '../assets/images/words');

async function convertImages() {
  console.log('🚀 Iniciando optimización rápida de imágenes...');

  if (!fs.existsSync(WORDS_DIR)) {
    console.error(`❌ Directorio no encontrado: ${WORDS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(WORDS_DIR);
  const pngOrJpgFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  });
  
  // Procesamos archivos .webp que superen los 45 KB (que no hayan sido optimizados)
  // o podemos auditar todos en paralelo a máxima velocidad
  const webpFiles = files.filter(f => path.extname(f).toLowerCase() === '.webp');

  const MAX_DIMENSION = 400; // Máxima resolución (ancho/alto) para vocabulario en la app

  let convertedCount = 0;
  let recompressedCount = 0;
  let savedBytes = 0;

  // 1. Convertir PNG/JPG a WebP, recortar bordes transparentes y redimensionar
  if (pngOrJpgFiles.length > 0) {
    console.log(`🖼️  Convirtiendo ${pngOrJpgFiles.length} imágenes PNG/JPG a WebP (recortando bordes transparentes y máx ${MAX_DIMENSION}px)...`);
    for (const file of pngOrJpgFiles) {
      const filePath = path.join(WORDS_DIR, file);
      const fileNameWithoutExt = path.basename(file, path.extname(file));
      const webpPath = path.join(WORDS_DIR, `${fileNameWithoutExt}.webp`);

      try {
        const inputBuffer = fs.readFileSync(filePath);
        const originalSize = inputBuffer.length;

        let pipeline = sharp(inputBuffer);
        try {
          pipeline = pipeline.trim();
        } catch {
          pipeline = sharp(inputBuffer);
        }

        const optimizedBuffer = await pipeline
          .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85, effort: 4 })
          .toBuffer();

        fs.writeFileSync(webpPath, optimizedBuffer);
        fs.unlinkSync(filePath);
        convertedCount++;
        savedBytes += (originalSize - optimizedBuffer.length);

        const savingsPct = (((originalSize - optimizedBuffer.length) / originalSize) * 100).toFixed(1);
        console.log(`  ✓ ${file} ➔ ${fileNameWithoutExt}.webp (${(originalSize / 1024).toFixed(1)} KB ➔ ${(optimizedBuffer.length / 1024).toFixed(1)} KB, -${savingsPct}%)`);
      } catch (err) {
        console.error(`  ❌ Error convirtiendo ${file}:`, err.message);
      }
    }
  }

  // 2. Optimización para WebP existentes: SOLO procesa imágenes que realmente lo necesiten
  // (aquellas que midan más de MAX_DIMENSION o que pesen más de 50 KB sin optimizar)
  const candidateWebpFiles = webpFiles.filter(f => {
    const stat = fs.statSync(path.join(WORDS_DIR, f));
    return stat.size > 45 * 1024; // Solo candidatas pesadas
  });

  if (candidateWebpFiles.length > 0) {
    console.log(`🔍 Inspeccionando ${candidateWebpFiles.length} imágenes .webp potencialmente pesadas...`);
    await Promise.all(candidateWebpFiles.map(async (file) => {
      const filePath = path.join(WORDS_DIR, file);
      try {
        const inputBuffer = fs.readFileSync(filePath);
        const originalSize = inputBuffer.length;

        const metadata = await sharp(inputBuffer).metadata();
        const exceedsDimension = (metadata.width && metadata.width > MAX_DIMENSION) || (metadata.height && metadata.height > MAX_DIMENSION);
        const isVeryHeavy = originalSize > 50 * 1024;

        // Si la imagen ya tiene tamaño <= 400px y no es excesivamente pesada, NO TOCARLA
        if (!exceedsDimension && !isVeryHeavy) {
          return;
        }

        let pipeline = sharp(inputBuffer);
        try {
          pipeline = pipeline.trim();
        } catch {
          pipeline = sharp(inputBuffer);
        }

        const optimizedBuffer = await pipeline
          .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85, effort: 4 })
          .toBuffer();

        // Solo guardar si ahorra al menos 2 KB para evitar reescrituras innecesarias en Git
        if (optimizedBuffer.length < originalSize - 2048) {
          fs.writeFileSync(filePath, optimizedBuffer);
          recompressedCount++;
          savedBytes += (originalSize - optimizedBuffer.length);
          const savingsPct = (((originalSize - optimizedBuffer.length) / originalSize) * 100).toFixed(1);
          console.log(`  ✓ ${file} (${metadata.width}x${metadata.height}): ${(originalSize / 1024).toFixed(1)} KB ➔ ${(optimizedBuffer.length / 1024).toFixed(1)} KB (-${savingsPct}%)`);
        }
      } catch (err) {
        console.error(`  ❌ Error optimizando ${file}:`, err.message);
      }
    }));
  }

  if (convertedCount === 0 && recompressedCount === 0) {
    console.log('✨ Todas las imágenes WebP ya se encuentran optimizadas. No se modificó ningún archivo.');
  } else {
    console.log(`\n🎉 ¡Optimización finalizada! Se ahorraron ${(savedBytes / 1024).toFixed(1)} KB.`);
  }

  runGenerateMap();
}

function runGenerateMap() {
  console.log('🔄 Actualizando src/utils/imageMap.ts...');
  require('./generateImageMap.js');
}

convertImages().catch(err => {
  console.error('❌ Error general durante la optimización:', err);
  process.exit(1);
});
