import * as Speech from 'expo-speech';
import { getKanjiEssentialReading } from './jlpt-data';

/**
 * Mapeo de códigos de idioma a códigos ISO estándar para Expo Speech.
 */
const LANGUAGE_LOCALE_MAP: Record<string, string> = {
  'zh-CN': 'zh',
  'zh': 'zh',
  'ja-JP': 'ja',
  'ja': 'ja',
  'en-US': 'en',
  'en': 'en',
  'es-ES': 'es',
  'es': 'es',
  'fr-FR': 'fr',
  'fr': 'fr',
  'de-DE': 'de',
  'de': 'de',
  'it-IT': 'it',
  'it': 'it',
  'ko-KR': 'ko',
  'ko': 'ko',
  'pt-BR': 'pt',
  'pt': 'pt',
  'ru-RU': 'ru',
  'ru': 'ru',
};

let cachedVoices: Speech.Voice[] | null = null;

async function getBestVoiceForLanguage(langCode: string): Promise<string | undefined> {
  try {
    if (!cachedVoices || cachedVoices.length === 0) {
      cachedVoices = await Speech.getAvailableVoicesAsync();
    }
    const prefix = langCode.toLowerCase().split('-')[0];
    const available = cachedVoices.filter((v) => {
      const vLang = (v.language || '').toLowerCase().replace('_', '-');
      return vLang.startsWith(prefix) || vLang.includes(prefix);
    });

    console.log(`[AudioService] Found ${available.length} voices for ${prefix}:`, available.map((v) => v.name));

    // Descartar voces experimentales o restringidas (como 'star' de Google Assistant que fallan en TTS de terceros)
    const nonStar = available.filter((v) => !v.name.toLowerCase().includes('star'));
    const chosen = nonStar.find((v) => v.name.toLowerCase().includes('local')) || nonStar[0];
    return chosen?.identifier;
  } catch {
    return undefined;
  }
}

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

  const targetLang = LANGUAGE_LOCALE_MAP[languageCode] || languageCode.split('-')[0] || 'zh';
  let cleanText = text.trim();

  // Si es japonés, resolver pronunciación óptima
  if (targetLang.startsWith('ja')) {
    let readingTarget = (reading || '').trim();
    const hasKanji = /[\u4e00-\u9faf]/.test(cleanText);
    const isSingleChar = cleanText.length === 1;

    // Si el texto ya es una palabra completa con Kanji (ej. "飲む", "食べる", "日本人"),
    // NO reemplazar por hiragana suelto. Google TTS usa MeCab y pronuncia las palabras con kanji con 100% de precisión.
    // El hiragana puro y suelto (ej. "のむ") carece de límites morfológicos y genera pronunciaciones erráticas en TTS.
    if (!hasKanji || isSingleChar) {
      // Solo si es un único kanji aislado (ej. "山", "何", "日", "飲") o no tiene lectura explícita:
      if (!readingTarget && isSingleChar && hasKanji) {
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

        if (/[\u3040-\u30ff]/.test(cleanedKana)) {
          // Si es un kanji que representa un verbo común (ej. 飲 -> 飲む), construir la palabra canónica con okurigana
          const verbOkuriganaMap: Record<string, string> = {
            '飲': '飲む',
            '食': '食べる',
            '行': '行く',
            '来': '来る',
            '見': '見る',
            '聞': '聞く',
            '読': '読む',
            '書': '書く',
            '買': '買う',
            '話': '話す',
            '待': '待つ',
            '持': '持つ',
            '休': '休む',
            '言': '言う',
            '立': '立つ',
            '入': '入る',
            '出': '出る',
          };
          if (isSingleChar && hasKanji && verbOkuriganaMap[cleanText]) {
            cleanText = verbOkuriganaMap[cleanText];
          } else {
            cleanText = cleanedKana;
          }
        }
      }
    }
  }

  try {
    const voiceIdentifier = await getBestVoiceForLanguage(targetLang);
    console.log(
      '[AudioService] SPEAKING:',
      cleanText,
      'from text:',
      text,
      'reading:',
      reading,
      'lang:',
      targetLang,
      'voice:',
      voiceIdentifier || 'system-default'
    );
    await Speech.stop();
    // Pausa breve para garantizar que el servicio nativo de Android TTS haya purgado la cola previa (TextToSpeech.QUEUE_ADD)
    await new Promise((res) => setTimeout(res, 40));
    Speech.speak(cleanText, {
      language: targetLang,
      voice: voiceIdentifier,
      rate: 1.0,
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
    await Speech.stop();
  } catch (e) {}
}
