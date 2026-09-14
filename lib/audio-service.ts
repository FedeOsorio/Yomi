import * as Speech from 'expo-speech';
import { getKanjiEssentialReading } from './jlpt-data';

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
 * Para japonés, si se proporciona una lectura (reading/furigana) o es un kanji N5/N4,
 * se extrae la lectura esencial en kana para que TTS pronuncie la palabra natural
 * (ej. "山" -> "やま", "何" -> "なに", "本" -> "ほん").
 */
export async function speakText(
  text: string,
  languageCode: string = 'zh-CN',
  reading?: string
): Promise<void> {
  if (!text || !text.trim()) return;

  const targetLang = LANGUAGE_LOCALE_MAP[languageCode] || languageCode || 'zh-CN';
  let cleanText = text.trim();

  // Si es japonés, resolver pronunciación óptima en Kana
  if (targetLang.startsWith('ja')) {
    let readingTarget = (reading || '').trim();

    // Si el texto es un único kanji y existe lectura esencial en catálogo N5/N4
    if (cleanText.length === 1 && /[\u4e00-\u9faf]/.test(cleanText)) {
      const essential = getKanjiEssentialReading(cleanText);
      if (essential.essentialReading && essential.essentialReading !== cleanText) {
        readingTarget = essential.essentialReading;
      }
    }

    if (readingTarget) {
      // Si contiene formato "On: ... • Kun: ..." o similar, priorizar Kun'yomi para vocabulario
      if (/\b(on|kun)\b/i.test(readingTarget) || readingTarget.includes('•')) {
        const kunMatch = readingTarget.match(/kun[:：\s]*([^\/\n,、;•|]+)/i);
        const onMatch = readingTarget.match(/on[:：\s]*([^\/\n,、;•|]+)/i);
        if (kunMatch && kunMatch[1]) {
          readingTarget = kunMatch[1];
        } else if (onMatch && onMatch[1]) {
          readingTarget = onMatch[1];
        }
      }

      // Extraer la primera lectura antes de separadores /, ,, 、, ;, •, | o saltos de línea
      const primaryPart = readingTarget.split(/[\/\n,、;•|]/)[0] || '';
      // Quitar etiquetas On/Kun y símbolos auxiliares como puntos (・), guiones, tildes, paréntesis
      const cleanedKana = primaryPart
        .replace(/^(on|kun|音|訓)[:：\s]*/i, '')
        .replace(/[・~～\s\(\)（）\-\.]/g, '')
        .trim();

      // Si contiene caracteres kana (hiragana o katakana), usarla para que TTS hable la lectura exacta
      if (/[\u3040-\u30ff]/.test(cleanedKana)) {
        cleanText = cleanedKana;
      }
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
