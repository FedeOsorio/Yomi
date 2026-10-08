const {
  withAppBuildGradle,
  withGradleProperties,
  withAndroidManifest,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const withAndroidSigning = (config) => {
  // 1. Inyectar credenciales y optimización DEX (R8) en android/gradle.properties
  config = withGradleProperties(config, (configMod) => {
    const signingProps = [
      { key: 'YOMI_UPLOAD_STORE_FILE', value: '../../@fedeosorio24__Yomi.jks' },
      { key: 'YOMI_UPLOAD_KEY_ALIAS', value: 'f4b0f004eb3545b8ca534c3cd2f23ab0' },
      { key: 'YOMI_UPLOAD_STORE_PASSWORD', value: '850f9ac9560ccf276edd5ef5f1ba972b' },
      { key: 'YOMI_UPLOAD_KEY_PASSWORD', value: '1b4a25622413a22210e7ff22bb324d03' },
      { key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
      { key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
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

  // 2. Inyectar signingConfigs.release y optimización en android/app/build.gradle
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
    }

    // Usar proguard-android-optimize.txt en lugar de proguard-android.txt para optimización de DEX
    if (contents.includes('proguard-android.txt')) {
      contents = contents.replace('proguard-android.txt', 'proguard-android-optimize.txt');
    }

    configMod.modResults.contents = contents;

    return configMod;
  });

  // 3. Declarar micrófono como opcional para evitar restringir dispositivos en Google Play
  config = withAndroidManifest(config, (configMod) => {
    const manifest = configMod.modResults.manifest;
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }
    const features = [
      { name: 'android.hardware.microphone', required: false },
      { name: 'android.hardware.faketouch', required: false },
    ];
    features.forEach(({ name, required }) => {
      const existing = manifest['uses-feature'].find(
        (f) => f.$ && f.$['android:name'] === name
      );
      if (existing) {
        existing.$['android:required'] = required ? 'true' : 'false';
      } else {
        manifest['uses-feature'].push({
          $: {
            'android:name': name,
            'android:required': required ? 'true' : 'false',
          },
        });
      }
    });
    return configMod;
  });

  return config;
};

module.exports = createRunOncePlugin(withAndroidSigning, 'withAndroidSigning', '1.0.0');
