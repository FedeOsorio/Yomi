const { withAppBuildGradle, withGradleProperties, createRunOncePlugin } = require('@expo/config-plugins');

const withAndroidSigning = (config) => {
  // 1. Inyectar credenciales en android/gradle.properties
  config = withGradleProperties(config, (configMod) => {
    const signingProps = [
      { key: 'YOMI_UPLOAD_STORE_FILE', value: '../../@fedeosorio24__Yomi.jks' },
      { key: 'YOMI_UPLOAD_KEY_ALIAS', value: 'f4b0f004eb3545b8ca534c3cd2f23ab0' },
      { key: 'YOMI_UPLOAD_STORE_PASSWORD', value: '850f9ac9560ccf276edd5ef5f1ba972b' },
      { key: 'YOMI_UPLOAD_KEY_PASSWORD', value: '1b4a25622413a22210e7ff22bb324d03' },
    ];

    signingProps.forEach(({ key, value }) => {
      const existingIndex = configMod.modResults.findIndex((p) => p.type === 'property' && p.key === key);
      if (existingIndex >= 0) {
        configMod.modResults[existingIndex].value = value;
      } else {
        configMod.modResults.push({ type: 'property', key, value });
      }
    });

    return configMod;
  });

  // 2. Inyectar signingConfigs.release en android/app/build.gradle
  config = withAppBuildGradle(config, (configMod) => {
    let contents = configMod.modResults.contents;

    if (!contents.includes('YOMI_UPLOAD_STORE_FILE')) {
      const releaseSigningBlock = `        release {
            if (project.hasProperty('YOMI_UPLOAD_STORE_FILE')) {
                storeFile file(YOMI_UPLOAD_STORE_FILE)
                storePassword YOMI_UPLOAD_STORE_PASSWORD
                keyAlias YOMI_UPLOAD_KEY_ALIAS
                keyPassword YOMI_UPLOAD_KEY_PASSWORD
            }
        }\n`;

      // Insertar bloque release dentro de signingConfigs
      contents = contents.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\s*\n)/,
        `$1${releaseSigningBlock}`
      );

      // Usar signingConfig release en buildTypes.release
      contents = contents.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
        `$1signingConfig (project.hasProperty('YOMI_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug)`
      );

      configMod.modResults.contents = contents;
    }

    return configMod;
  });

  return config;
};

module.exports = createRunOncePlugin(withAndroidSigning, 'withAndroidSigning', '1.0.0');
