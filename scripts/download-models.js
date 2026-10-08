const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_DIR = path.join(__dirname, '..', 'assets', 'models', 'sense-voice');
const ANDROID_ASSETS_DIR = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'assets',
  'models',
  'sense-voice'
);

const FILES = [
  {
    name: 'tokens.txt',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt',
  },
  {
    name: 'model.int8.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx',
  },
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastLoggedPercent = -1;

        const fileStream = fs.createWriteStream(destPath);
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.floor((downloadedBytes / totalBytes) * 100);
            if (pct % 10 === 0 && pct !== lastLoggedPercent) {
              lastLoggedPercent = pct;
              process.stdout.write(`Downloading ${path.basename(destPath)}: ${pct}%\r`);
            }
          }
        });

        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`\nSaved ${path.basename(destPath)} (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
          resolve();
        });
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.mkdirSync(ANDROID_ASSETS_DIR, { recursive: true });

  for (const item of FILES) {
    const targetFile = path.join(TARGET_DIR, item.name);
    const androidFile = path.join(ANDROID_ASSETS_DIR, item.name);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 1000) {
      console.log(`[OK] Already exists: ${item.name}`);
    } else {
      console.log(`Downloading ${item.name}...`);
      await downloadFile(item.url, targetFile);
    }

    if (!fs.existsSync(androidFile) || fs.statSync(androidFile).size !== fs.statSync(targetFile).size) {
      fs.copyFileSync(targetFile, androidFile);
      console.log(`[Synced] Copied ${item.name} to Android assets.`);
    }
  }

  console.log('SenseVoice models setup complete.');
}

main().catch((err) => {
  console.error('Error downloading models:', err);
  process.exit(1);
});
