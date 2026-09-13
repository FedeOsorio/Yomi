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
 * Para japonés, si se proporciona una lectura (reading/furigana), se extrae la lectura primaria
 * en kana para evitar lecturas arcaicas o erróneas en caracteres sueltos (ej. "三" -> "MI" en vez de "SAN").
 */
export async function speakText(
  text: string,
  languageCode: string = 'zh-CN',
  reading?: string
): Promise<void> {
  if (!text || !text.trim()) return;

  const targetLang = LANGUAGE_LOCALE_MAP[languageCode] || languageCode || 'zh-CN';
  let cleanText = text.trim();

  // Si es japonés y se proporcionó una lectura (ej. kanji suelto o tarjeta con furigana)
  if (targetLang.startsWith('ja') && reading && reading.trim()) {
    // Extraer la primera lectura antes de separadores /, ,, 、, ; o saltos de línea
    const primaryPart = reading.split(/[\/\n,、;]/)[0] || '';
    // Quitar símbolos auxiliares como puntos de separación (・), guiones, tildes, o paréntesis
    const cleanedKana = primaryPart.replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
    // Si contiene caracteres kana (hiragana o katakana), usarla para que TTS hable la lectura exacta
    if (/[\u3040-\u30ff]/.test(cleanedKana)) {
      cleanText = cleanedKana;
    }
  }

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
