const { createRunOncePlugin, withGradleProperties } = require('expo/config-plugins');

/**
 * Ajustes de compilación Android para react-native-sherpa-onnx.
 * El modelo de voz NO se empaqueta en el APK: la app lo descarga la primera vez que se usa.
 */
const GRADLE_PROPERTIES = {
  // La app solo usa reconocimiento de voz: no hace falta FFmpeg ni libarchive (APK más chico).
  sherpaOnnxDisableFfmpeg: 'true',
  sherpaOnnxDisableLibarchive: 'true',
  // Evita el error de "archivo duplicado" si otra librería también trae onnxruntime.
  'android.packagingOptions.pickFirsts': '**/libonnxruntime.so',
  // La compilación nativa de sherpa necesita más memoria que el valor por defecto de Expo.
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
};

const withSherpaOnnx = (config) =>
  withGradleProperties(config, (mod) => {
    for (const [key, value] of Object.entries(GRADLE_PROPERTIES)) {
      const existing = mod.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });

module.exports = createRunOncePlugin(withSherpaOnnx, 'with-sherpa-onnx', '1.0.0');
