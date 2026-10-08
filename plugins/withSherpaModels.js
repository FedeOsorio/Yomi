const {
  createRunOncePlugin,
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSherpaModels = (config) => {
  // 1. Deshabilitar FFmpeg y Libarchive en gradle.properties para un build nativo limpio y rápido
  config = withGradleProperties(config, (configMod) => {
    const propsToAdd = [
      { key: 'sherpaOnnxDisableFfmpeg', value: 'true' },
      { key: 'sherpaOnnxDisableLibarchive', value: 'true' },
    ];
    propsToAdd.forEach(({ key, value }) => {
      const idx = configMod.modResults.findIndex((p) => p.type === 'property' && p.key === key);
      if (idx >= 0) {
        configMod.modResults[idx].value = value;
      } else {
        configMod.modResults.push({ type: 'property', key, value });
      }
    });
    return configMod;
  });

  // 2. Copiar carpeta de modelos de assets si existe (ej. assets/models/sense-voice) a android/app/src/main/assets/models/sense-voice
  config = withDangerousMod(config, [
    'android',
    async (configMod) => {
      const projectRoot = configMod.modRequest.projectRoot;
      const modelSourceDir = path.join(projectRoot, 'assets', 'models', 'sense-voice');
      const androidAssetsTarget = path.join(
        configMod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'models',
        'sense-voice'
      );

      if (fs.existsSync(modelSourceDir)) {
        console.log('[withSherpaModels] Copying SenseVoice model assets to Android bundle...');
        fs.mkdirSync(androidAssetsTarget, { recursive: true });
        const files = fs.readdirSync(modelSourceDir);
        for (const file of files) {
          const srcFile = path.join(modelSourceDir, file);
          const dstFile = path.join(androidAssetsTarget, file);
          if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, dstFile);
          }
        }
      }
      return configMod;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(withSherpaModels, 'with-sherpa-models', '1.0.0');
