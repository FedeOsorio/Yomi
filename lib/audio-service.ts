import * as Speech from 'expo-speech';

/**
 * Mapeo de códigos de idioma a códigos ISO estándar para Expo Speech.
 */
const LANGUAGE_LOCALE_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh': 'zh-CN',
  'ja-JP': 'ja-JP',
  'ja': 'ja-JP',
  'en-US': 'en-US',
  'en': 'en-US',
  'es-ES': 'es-ES',
  'es': 'es-ES',
  'fr-FR': 'fr-FR',
  'fr': 'fr-FR',
  'de-DE': 'de-DE',
  'de': 'de-DE',
  'it-IT': 'it-IT',
  'it': 'it-IT',
  'ko-KR': 'ko-KR',
  'ko': 'ko-KR',
  'pt-BR': 'pt-BR',
  'pt': 'pt-BR',
  'ru-RU': 'ru-RU',
  'ru': 'ru-RU',
};

/**
 * Reproduce la pronunciación en audio de un texto en el idioma nativo especificado.
 */
export async function speakText(text: string, languageCode: string = 'zh-CN'): Promise<void> {
  if (!text || !text.trim()) return;

  const targetLang = LANGUAGE_LOCALE_MAP[languageCode] || languageCode || 'zh-CN';
  const cleanText = text.trim();

  try {
    Speech.stop();
    Speech.speak(cleanText, {
      language: targetLang,
      rate: 0.85,
      pitch: 1.0,
      onError: (err) => {
        console.warn('Error en Speech.speak:', err);
      },
    });
  } catch (error) {
    console.warn('Excepción en TTS:', error);
  }
}

/**
 * Detiene cualquier audio en reproducción.
 */
export async function stopSpeech(): Promise<void> {
  try {
    Speech.stop();
  } catch (e) {}
}
