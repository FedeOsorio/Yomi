import { JLPT_KANJI_READINGS } from './jlpt-data';
import { KANJI_READINGS_MAP as UNIVERSAL_KANJI_READINGS_MAP } from './kanji-readings-db';

/**
 * Utilidades para conversión de Romaji a Hiragana y Katakana.
 */

const ROMAJI_TO_HIRAGANA_MAP: Record<string, string> = {
  // Vocales
  'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',

  // K
  'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
  'kya': 'きゃ', 'kyu': 'きゅ', 'kyo': 'きょ',

  // S
  'sa': 'さ', 'shi': 'し', 'si': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
  'sha': 'しゃ', 'shu': 'しゅ', 'sho': 'しょ',

  // T
  'ta': 'た', 'chi': 'ち', 'ti': 'ち', 'tsu': 'つ', 'tu': 'つ', 'te': 'て', 'to': 'と',
  'cha': 'ちゃ', 'chu': 'ちゅ', 'cho': 'ちょ',

  // N
  'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
  'nya': 'にゃ', 'nyu': 'にゅ', 'nyo': 'にょ',
  'n': 'ん', 'nn': 'ん',

  // H / F
  'ha': 'は', 'hi': 'ひ', 'fu': 'ふ', 'hu': 'ふ', 'he': 'へ', 'ho': 'ほ',
  'hya': 'ひゃ', 'hyu': 'ひゅ', 'hyo': 'ひょ',

  // M
  'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
  'mya': 'みゃ', 'myu': 'みゅ', 'myo': 'みょ',

  // Y
  'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',

  // R
  'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
  'rya': 'りゃ', 'ryu': 'りゅ', 'ryo': 'りょ',

  // W
  'wa': 'わ', 'wo': 'を',

  // G
  'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
  'gya': 'ぎゃ', 'gyu': 'ぎゅ', 'gyo': 'ぎょ',

  // Z / J
  'za': 'ざ', 'ji': 'じ', 'zi': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
  'ja': 'じゃ', 'ju': 'じゅ', 'jo': 'じょ',

  // D
  'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',

  // B
  'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
  'bya': 'びゃ', 'byu': 'びゅ', 'byo': 'びょ',

  // P
  'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
  'pya': 'ぴゃ', 'pyu': 'ぴゅ', 'pyo': 'ぴょ',

  // Adaptaciones fonéticas español / latino (evitan que queden letras hispanas en el visor)
  'ca': 'か', 'co': 'こ', 'cu': 'く', 'ci': 'し', 'ce': 'せ',
  'que': 'け', 'qui': 'き',
  'la': 'ら', 'li': 'り', 'lu': 'る', 'le': 'れ', 'lo': 'ろ',
  'lya': 'りゃ', 'lyu': 'りゅ', 'lyo': 'りょ',
  'va': 'ば', 'vi': 'び', 'vu': 'ぶ', 've': 'べ', 'vo': 'ぼ',
  'gue': 'げ', 'gui': 'ぎ',
  'lla': 'や', 'lli': 'り', 'llu': 'ゆ', 'lle': 'え', 'llo': 'よ',
  'ña': 'にゃ', 'ñi': 'に', 'ñu': 'にゅ', 'ñe': 'ね', 'ño': 'にょ',
  'che': 'ちぇ',
  'je': 'じぇ',
};

export const JA_NUMBERS: Record<string, { kana: string; kanji: string }> = {
  '0': { kana: 'れい', kanji: '零' },
  '1': { kana: 'いち', kanji: '一' },
  '2': { kana: 'に', kanji: '二' },
  '3': { kana: 'さん', kanji: '三' },
  '4': { kana: 'よん', kanji: '四' },
  '5': { kana: 'ご', kanji: '五' },
  '6': { kana: 'ろく', kanji: '六' },
  '7': { kana: 'なな', kanji: '七' },
  '8': { kana: 'はち', kanji: '八' },
  '9': { kana: 'きゅう', kanji: '九' },
  '10': { kana: 'じゅう', kanji: '十' },
  '11': { kana: 'じゅういち', kanji: '十一' },
  '12': { kana: 'じゅうに', kanji: '十二' },
  '13': { kana: 'じゅうさん', kanji: '十三' },
  '14': { kana: 'じゅうよん', kanji: '十四' },
  '15': { kana: 'じゅうご', kanji: '十五' },
  '16': { kana: 'じゅうろく', kanji: '十六' },
  '17': { kana: 'じゅうなな', kanji: '十七' },
  '18': { kana: 'じゅうはち', kanji: '十八' },
  '19': { kana: 'じゅうきゅう', kanji: '十九' },
  '20': { kana: 'にじゅう', kanji: '二十' },
  '30': { kana: 'さんじゅう', kanji: '三十' },
  '40': { kana: 'よんじゅう', kanji: '四十' },
  '50': { kana: 'ごじゅう', kanji: '五十' },
  '100': { kana: 'ひゃく', kanji: '百' },
  '200': { kana: 'にひゃく', kanji: '二百' },
  '300': { kana: 'さんびゃく', kanji: '三百' },
  '400': { kana: 'よんひゃく', kanji: '四百' },
  '500': { kana: 'ごひゃく', kanji: '五百' },
  '600': { kana: 'ろっぴゃく', kanji: '六百' },
  '700': { kana: 'ななひゃく', kanji: '七百' },
  '800': { kana: 'はっぴゃく', kanji: '八百' },
  '900': { kana: 'きゅうひゃく', kanji: '九百' },
  '1000': { kana: 'せん', kanji: '千' },
  '2000': { kana: 'にせん', kanji: '二千' },
  '3000': { kana: 'さんぜん', kanji: '三千' },
  '4000': { kana: 'よんせん', kanji: '四千' },
  '5000': { kana: 'ごせん', kanji: '五千' },
  '6000': { kana: 'ろくせん', kanji: '六千' },
  '7000': { kana: 'ななせん', kanji: '七千' },
  '8000': { kana: 'はっせん', kanji: '八千' },
  '9000': { kana: 'きゅうせん', kanji: '九千' },
  '10000': { kana: 'いちまん', kanji: '一万' },
  '100000': { kana: 'じゅうまん', kanji: '十万' },
  '1000000': { kana: 'ひゃくまん', kanji: '百万' },
};

export const ZH_NUMBERS: Record<string, { pinyin: string; hanzi: string }> = {
  '0': { pinyin: 'ling2', hanzi: '零' },
  '1': { pinyin: 'yi1', hanzi: '一' },
  '2': { pinyin: 'er4', hanzi: '二' },
  '3': { pinyin: 'san1', hanzi: '三' },
  '4': { pinyin: 'si4', hanzi: '四' },
  '5': { pinyin: 'wu3', hanzi: '五' },
  '6': { pinyin: 'liu4', hanzi: '六' },
  '7': { pinyin: 'qi1', hanzi: '七' },
  '8': { pinyin: 'ba1', hanzi: '八' },
  '9': { pinyin: 'jiu3', hanzi: '九' },
  '10': { pinyin: 'shi2', hanzi: '十' },
};

/**
 * Convierte una cadena de texto en Romaji a Hiragana (ej. "hon" -> "ほん", "arigatou" -> "ありがとう", "o-i" -> "おおい").
 */
export function romajiToHiragana(romaji: string): string {
  if (!romaji) return '';

  let text = romaji.toLowerCase().trim();

  // 1. Normalizar vocales con macron de romanización (ej. ō -> ou, ū -> uu, etc.)
  text = text
    .replace(/[āáàâ]/g, 'aa')
    .replace(/[īíìî]/g, 'ii')
    .replace(/[ūúùû]/g, 'uu')
    .replace(/[ēéèê]/g, 'ee')
    .replace(/[ōóòô]/g, 'ou');

  // 2. Normalizar guiones morfológicos (ej. "hyaku-en" -> "hyakuen", "shin-osaka" -> "shin'osaka")
  text = text.replace(/n-([aeiouy])/g, "n'$1").replace(/[-_]/g, '');

  // Normalizar casos comunes donde 'n' precede a una vocal en compuestos léxicos (ej. senen -> sen'en -> せんえん)
  text = text
    .replace(/\bsen([aeiou])/g, "sen'$1")
    .replace(/\bman([aeiou])/g, "man'$1")
    .replace(/\bkan([aeiou])/g, "kan'$1")
    .replace(/\bshin([aeiou])/g, "shin'$1")
    .replace(/\bren([aeiou])/g, "ren'$1")
    .replace(/\bzen([aeiou])/g, "zen'$1")
    .replace(/\bkin([aeiou])/g, "kin'$1");

  let result = '';
  let i = 0;

  while (i < text.length) {
    // Manejo de consonantes dobles (pequeño tsu: っ), ej. "matte" -> "まって", "gakkou" -> "がっこう"
    if (
      i + 1 < text.length &&
      text[i] === text[i + 1] &&
      !['a', 'i', 'u', 'e', 'o', 'n'].includes(text[i])
    ) {
      result += 'っ';
      i++;
      continue;
    }

    // Manejo especial de 'n' antes de vocal o consonante
    if (text[i] === 'n') {
      if (text[i + 1] === "'" || text[i + 1] === '-') {
        result += 'ん';
        i += 2;
        continue;
      }
      if (i + 1 === text.length || !['a', 'i', 'u', 'e', 'o', 'y'].includes(text[i + 1])) {
        result += 'ん';
        i++;
        continue;
      }
    }

    // Intentar coincidencia de 3 caracteres (ej. "sha", "kyo", "chi")
    const three = text.slice(i, i + 3);
    if (ROMAJI_TO_HIRAGANA_MAP[three]) {
      result += ROMAJI_TO_HIRAGANA_MAP[three];
      i += 3;
      continue;
    }

    // Intentar coincidencia de 2 caracteres (ej. "ka", "ts", "shi")
    const two = text.slice(i, i + 2);
    if (ROMAJI_TO_HIRAGANA_MAP[two]) {
      result += ROMAJI_TO_HIRAGANA_MAP[two];
      i += 2;
      continue;
    }

    // Intentar coincidencia de 1 carácter (ej. vocales "a", "i")
    const one = text.slice(i, i + 1);
    if (ROMAJI_TO_HIRAGANA_MAP[one]) {
      result += ROMAJI_TO_HIRAGANA_MAP[one];
      i += 1;
      continue;
    }

    // Caracter no reconocido o consonante aislada de voz/español
    if (text[i] !== '-' && text[i] !== '_') {
      const ch = text[i];
      const isolatedMap: Record<string, string> = {
        'j': 'じ', 'c': 'く', 'k': 'く', 't': 'と', 's': 'す',
        'm': 'む', 'r': 'る', 'l': 'る', 'p': 'ぷ', 'b': 'ぶ',
        'g': 'ぐ', 'd': 'ど', 'z': 'ず', 'f': 'ふ', 'h': 'は',
        'y': 'い', 'w': 'う', 'v': 'ぶ', 'q': 'く', 'x': 'くす',
        'ñ': 'ん',
      };
      result += isolatedMap[ch] || ch;
    }
    i++;
  }

  return result;
}

/**
 * Determina si un texto contiene caracteres japoneses (Hiragana, Katakana o Kanji).
 */
export function containsJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

/**
 * Idioma de un texto suelto según su escritura. Se usa en mazos personalizados, donde cada
 * pregunta y respuesta puede estar en cualquier idioma (p. ej. pregunta en español, respuesta en japonés).
 * El alfabeto latino no permite distinguir español / inglés / francés: ahí se usa `fallback`.
 */
export function detectTextLanguage(text: string | null | undefined, fallback = 'es-ES'): string {
  const t = (text || '').trim();
  if (/[\u3040-\u30ff]/.test(t)) return 'ja-JP';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(t)) return 'ko-KR';
  if (/[\u0400-\u04ff]/.test(t)) return 'ru-RU';
  const han = t.match(/[\u4e00-\u9fff]/g);
  if (han) {
    // Solo ideogramas: si alguno no existe en japonés (你, 们, 这…) es chino; si no, japonés
    return han.some((c) => !UNIVERSAL_KANJI_READINGS_MAP[c]) ? 'zh-CN' : 'ja-JP';
  }
  return fallback;
}

/**
 * Idioma de una tarjeta.
 * - Mazo de idioma: el idioma del mazo (un mazo nunca mezcla idiomas).
 * - Mazo personalizado: no se asume nada; se detecta por la escritura de la pregunta.
 */
export function getEffectiveCardLanguage(
  card?: { languageCode?: string | null; deckType?: string | null; displayText?: string | null } | null
): string {
  if (card?.deckType === 'custom' || card?.languageCode === 'custom') return detectTextLanguage(card.displayText);
  const code = (card?.languageCode || '').trim();
  if (!code) return 'ja-JP';
  const base = code.toLowerCase().split('-')[0];
  const canonical: Record<string, string> = { ja: 'ja-JP', zh: 'zh-CN', en: 'en-US', es: 'es-ES' };
  return canonical[base] ?? code;
}

/**
 * Convierte caracteres Katakana a Hiragana.
 */
export function katakanaToHiragana(text: string): string {
  if (!text) return '';
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

const HIRAGANA_TO_ROMAJI_MAP: Record<string, string> = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'to': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'no': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'go': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'zo': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'do': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'bo': 'bo',
  'ぱ': 'pa', 'pi': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'po': 'po',
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
};

/**
 * Convierte Hiragana a Romaji de forma determinística para sesgo contextual (contextual biasing).
 */
export function hiraganaToRomaji(kana: string): string {
  if (!kana) return '';
  let result = '';
  let i = 0;
  while (i < kana.length) {
    if (i + 1 < kana.length && HIRAGANA_TO_ROMAJI_MAP[kana.slice(i, i + 2)]) {
      result += HIRAGANA_TO_ROMAJI_MAP[kana.slice(i, i + 2)];
      i += 2;
    } else if (HIRAGANA_TO_ROMAJI_MAP[kana[i]]) {
      result += HIRAGANA_TO_ROMAJI_MAP[kana[i]];
      i += 1;
    } else {
      result += kana[i];
      i += 1;
    }
  }
  return result;
}

/**
 * Expande marcas de sonido prolongado (ー / -) al sonido vocálico en Hiragana
 * según la mora o kana precedente (ej. "しゅー" -> "しゅう", "おーい" -> "おおい").
 */
export function expandChoonpu(text: string): string {
  if (!text) return '';
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === 'ー' || ch === '-') {
      const prev = res.length > 0 ? res[res.length - 1] : '';
      if (!prev) continue;

      if (prev === 'ゅ' || prev === 'ょ') {
        res += 'う';
      } else if (prev === 'ゃ') {
        res += 'あ';
      } else if (prev === 'ぃ') {
        res += 'い';
      } else if (prev === 'ぇ') {
        res += 'え';
      } else if (prev === 'お' && (i + 1 < text.length && text[i + 1] === 'い')) {
        res += 'お';
      } else if ('あかさたなはまやらわがざだばぱ'.includes(prev)) {
        res += 'あ';
      } else if ('いきしちにひみりぎじぢびぴ'.includes(prev)) {
        res += 'い';
      } else if ('うくすつぬふむゆるぐずづぶぷ'.includes(prev)) {
        res += 'う';
      } else if ('えけせてねへめれげぜでべぺ'.includes(prev)) {
        res += 'い';
      } else if ('おこそとのほもよろごぞどぼぽ'.includes(prev)) {
        res += (prev === 'お' ? 'お' : 'う');
      }
    } else {
      res += ch;
    }
  }
  return res;
}

/**
 * Convierte caracteres Kanji habituales en práctica y homófonos de reconocimiento por voz a su lectura Kana.
 * Utiliza el catálogo canónico universal de 2.678 Kanjis (JLPT N5 a N1 y Jouyou).
 */
export function kanjiToHiragana(text: string): string {
  if (!text) return '';
  let res = text.trim();
  let out = '';
  for (let i = 0; i < res.length; i++) {
    const ch = res[i];
    if (UNIVERSAL_KANJI_READINGS_MAP[ch] && UNIVERSAL_KANJI_READINGS_MAP[ch].length > 0) {
      out += UNIVERSAL_KANJI_READINGS_MAP[ch][0];
    } else if (JLPT_KANJI_READINGS[ch]?.essential) {
      out += JLPT_KANJI_READINGS[ch].essential;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Normaliza cualquier texto en japonés (Romaji, Katakana, Hiragana o Kanji fonético) a Hiragana puro sin puntuación ni espacios.
 */
export function toNormalizedHiragana(text: string): string {
  if (!text) return '';
  // 1. Kanji conocidos → su lectura principal
  let result = kanjiToHiragana(text.toLowerCase().trim());

  // 2. Romaji → hiragana
  if (/[a-z]/.test(result)) {
    result = romajiToHiragana(result);
  }

  // 3. Convertir katakana a hiragana
  result = katakanaToHiragana(result);

  // 4. Expandir chōonpu (ー / -) a su sonido de vocal largo
  result = expandChoonpu(result);

  // 5. Normalizar vocales pequeñas (ej. 'うぇ' de 'ウェ' -> 'うえ') para coincidencia fonética precisa
  result = result.replace(/[ぁぃぅぇぉゎ]/g, (ch) => {
    switch (ch) {
      case 'ぁ': return 'あ';
      case 'ぃ': return 'い';
      case 'ぅ': return 'う';
      case 'ぇ': return 'え';
      case 'ぉ': return 'お';
      case 'ゎ': return 'わ';
      default: return ch;
    }
  });

  // 6. Eliminar signos de puntuación, puntos japoneses, guiones, espacios y cualquier letra latina residual
  return result.replace(/[\s.,!?;:。、！？・\-_~～\u30fc]/g, '').replace(/[a-zA-Z]/g, '');
}

/**
 * Expande cualquier transcripción con kanjis u homófonos (ej. '揚がって', '挙がって', '上がって')
 * a todas sus posibles combinaciones fonéticas en Hiragana canónico.
 * Es crucial para motores de voz (Google STT) que eligen kanjis homófonos arbitrarios.
 */
export function expandKanjiToHiraganaCandidates(text: string): string[] {
  if (!text) return [];
  const clean = text.trim();
  let candidates: string[] = [''];

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const mapReadings = UNIVERSAL_KANJI_READINGS_MAP[ch];
    const jlptEssential = JLPT_KANJI_READINGS[ch]?.essential;
    const readings: string[] = [];

    if (mapReadings && mapReadings.length > 0) {
      readings.push(...mapReadings);
    }
    if (jlptEssential && !readings.includes(jlptEssential)) {
      readings.push(jlptEssential);
    }

    if (readings.length > 0) {
      const next: string[] = [];
      for (const prefix of candidates) {
        for (const r of readings) {
          next.push(prefix + r);
          if (next.length >= 60) break;
        }
        if (next.length >= 60) break;
      }
      candidates = next;
    } else {
      for (let j = 0; j < candidates.length; j++) {
        candidates[j] += ch;
      }
    }
  }

  const results = new Set<string>();
  for (const c of candidates) {
    const norm = toNormalizedHiragana(c);
    if (norm) results.add(norm);
  }
  return Array.from(results);
}


/**
 * Conjunto de sustantivos, pronombres, adverbios y expresiones comunes en Kana
 * que terminan fonéticamente en vocales u okurigana verbales (う, く, ぐ, す, つ, ぬ, ぶ, む, る, い)
 * pero NO son verbos ni adjetivos conjugables.
 */
export const COMMON_KANA_NOUNS_AND_EXPRESSIONS = new Set([
  // Posiciones y direcciones
  'みぎ', 'ひだり', 'うえ', 'した', 'まえ', 'うしろ', 'なか', 'そと', 'あいだ', 'となり', 'ちかく', 'とおく', 'そば',
  // Partes del cuerpo
  'あたま', 'かお', 'め', 'みみ', 'はな', 'くち', 'は', 'て', 'あし', 'ゆび', 'からだ', 'こころ', 'くび', 'せなか', 'ひざ', 'ひじ',
  // Animales y naturaleza
  'いぬ', 'ねこ', 'とり', 'さかな', 'うま', 'うし', 'ぶた', 'むし', 'そら', 'あめ', 'ゆき', 'かぜ', 'つき', 'ほし',
  'やま', 'かわ', 'うみ', 'き', 'はな', 'くさ', 'もり', 'はやし', 'いけ', 'みず',
  // Tiempo y estaciones
  'きょう', 'あした', 'あす', 'きのう', 'おととい', 'あさ', 'ひる', 'よる', 'ばん', 'いま',
  'はる', 'なつ', 'あき', 'ふゆ', 'とし', 'つき', 'ひ', 'いつ',
  // Objetos y comida
  'くつ', 'いす', 'つくえ', 'ほん', 'かみ', 'くるま', 'でんしゃ', 'おちゃ', 'にく', 'ごはん', 'パン', 'さけ', 'しお', 'さとう',
  'いえ', 'うち', 'へや', 'ドア', 'まど', 'ふく', 'ぼうし', 'かばん', 'さいふ', 'とけい', 'めがね',
  // Personas y pronombres
  'ひと', 'かた', 'おとこ', 'おんな', 'こども', 'おとな', 'ともだち', 'かぞく',
  'わたし', 'ぼく', 'あなた', 'かれ', 'かのじょ', 'だれ', 'どなた', 'みんな', 'みなさん',
  'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ',
  'こちら', 'そちら', 'あちら', 'どちら', 'こっち', 'そっち', 'あっち', 'どっち',
  'なに', 'なん', 'いくら', 'いくつ', 'どう', 'いかが', 'なぜ', 'どうして',
  // Saludos y fórmulas corteses
  'ありがとう', 'ありがとうございます', 'どうも', 'どうぞ', 'おはよう', 'おはようございます',
  'こんにちは', 'こんばんは', 'さようなら', 'じゃあ', 'また', 'しつれいします',
  'すみません', 'ごめんなさい', 'いただきます', 'ごちそうさま', 'ごちそうさ免费', 'ごちそうさまでした',
  'よろしく', 'おねがいします', 'おめでとう', 'おめでとうございます', 'はい', 'いいえ',
  // Contadores y números que terminan en tsu/chi
  'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', 'とお',
  // Adverbios que terminan en u/ku/su/tsu/ru
  'すこし', 'たくさん', 'もっと', 'ずっと', 'いつも', 'まだ', 'もう', 'ゆっくり', 'はっきり',
  'しっかり', 'びっくり', 'やっぱり', 'たぶん', 'ぜんぜん', 'あまり', 'ちょうど', 'たいへん',
  'たいてい', 'ときどき', 'たまに', 'よく', 'すぐに', 'すでに', 'だんだん', 'どんどん',
  'ますます', 'かなり', 'ずいぶん', 'とても', 'いっしょに', 'べつに', 'とくに', 'もちろん'
]);

/**
 * Reglas de desconjugación verbal y adjetival en japonés para revertir formas conjugadas a su forma de diccionario (Jisho-kei).
 * Cubre:
 * - Forma -te (食べて -> 食べる, 待って -> 待つ/待てる, 飲んで -> 飲む, 行って -> 行く, して -> する, きて -> くる)
 * - Forma -ta (食べた -> 食べる, 待った -> 待つ)
 * - Forma -nai (食べない -> 食べる, 待たない -> 待つ, しない -> する)
 * - Forma -masu (食べます -> 食べる, 飲みます -> 飲む, します -> する)
 * - Adjetivos -i (美味しくて -> 美味しい, 美味しかった -> 美味しい)
 */
export function deconjugateJapanese(text: string): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (clean.length < 2) return [clean];

  // Si la palabra termina en kanji (ej. 右, 肉, 靴, 夏, 学校, 今日, 本),
  // por ortografía del japonés NO tiene okurigana y es imposible que sea una forma conjugada de verbo o adjetivo.
  if (/[\u4e00-\u9faf]$/.test(clean)) {
    return [clean];
  }

  const normalized = toNormalizedHiragana(clean);
  const candidates = new Set<string>();
  candidates.add(clean);
  if (normalized !== clean) {
    candidates.add(normalized);
  }

  const runRulesOnString = (target: string) => {
    const addCand = (cand: string) => {
      if (cand && cand.length >= 2 && !/[\u4e00-\u9faf]$/.test(cand) && !COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(cand)) {
        candidates.add(cand);
      }
    };

    // 1. Desconjugación de la forma -te (-て / -で)
    if (target.endsWith('て') || target.endsWith('で')) {
      const stem = target.slice(0, -1);
      if (stem.length >= 1) {
        addCand(stem + 'る'); // Ichidan
        if (target.endsWith('って')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'う');
            addCand(base + 'つ');
            addCand(base + 'る');
          }
        }
        if (target.endsWith('いて')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'く');
          }
        }
        if (target.endsWith('いで')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'ぐ');
          }
        }
        if (target.endsWith('して')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'す');
            addCand(base + 'する');
          }
        }
        if (target.endsWith('んで')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'む');
            addCand(base + 'ぶ');
            addCand(base + 'ぬ');
          }
        }
        // Adjetivos -i (ej. 美味しくて -> 美味しい)
        if (target.endsWith('くて')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'い');
          }
        }
      }
      if (target === 'して' || target.endsWith('して')) {
        addCand(target.replace(/して$/, 'する'));
      }
      if (target === 'きて' || target.endsWith('きて')) {
        addCand(target.replace(/きて$/, 'くる'));
      }
    }

    // 2. Desconjugación de la forma -ta (-た / -だ) (pasado)
    if (target.endsWith('た') || target.endsWith('だ')) {
      const stem = target.slice(0, -1);
      if (stem.length >= 1) {
        addCand(stem + 'る');
        if (target.endsWith('った')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'う');
            addCand(base + 'つ');
            addCand(base + 'る');
          }
        }
        if (target.endsWith('いた')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'く');
          }
        }
        if (target.endsWith('した')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'す');
            addCand(base + 'する');
          }
        }
        if (target.endsWith('かった')) {
          const base = target.slice(0, -3);
          if (base.length >= 1) {
            addCand(base + 'い');
          }
        }
        if (target.endsWith('んだ')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'む');
            addCand(base + 'ぶ');
            addCand(base + 'ぬ');
          }
        }
        if (target.endsWith('いだ')) {
          const base = target.slice(0, -2);
          if (base.length >= 1) {
            addCand(base + 'ぐ');
          }
        }
      }
      if (target === 'した' || target.endsWith('した')) {
        addCand(target.replace(/した$/, 'する'));
      }
      if (target === 'きた' || target.endsWith('きた')) {
        addCand(target.replace(/きた$/, 'くる'));
      }
    }

    // 3. Desconjugación de la forma cortés -masu (-ます)
    if (target.endsWith('ます')) {
      const stem = target.slice(0, -2);
      if (stem.length >= 1) {
        addCand(stem + 'る');
        const lastChar = stem[stem.length - 1];
        const base = stem.slice(0, -1);
        if (base.length >= 1) {
          if (lastChar === 'い') addCand(base + 'う');
          if (lastChar === 'ち') addCand(base + 'つ');
          if (lastChar === 'り') addCand(base + 'る');
          if (lastChar === 'き') addCand(base + 'く');
          if (lastChar === 'ぎ') addCand(base + 'ぐ');
          if (lastChar === 'し') addCand(base + 'す');
          if (lastChar === 'み') addCand(base + 'む');
          if (lastChar === 'び') addCand(base + 'ぶ');
          if (lastChar === 'に') addCand(base + 'ぬ');
        }
      }

      if (target === 'します' || target.endsWith('します')) {
        addCand(target.replace(/します$/, 'する'));
      }
      if (target === 'きます' || target.endsWith('きます')) {
        addCand(target.replace(/きます$/, 'くる'));
      }
    }

    // 4. Desconjugación de la forma negativa -nai (-ない)
    if (target.endsWith('ない')) {
      const stem = target.slice(0, -2);
      if (stem.length >= 1) addCand(stem + 'る');
      if (target.endsWith('わない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'う');
      }
      if (target.endsWith('かない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'く');
      }
      if (target.endsWith('さない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'す');
      }
      if (target.endsWith('たない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'つ');
      }
      if (target.endsWith('なない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'ぬ');
      }
      if (target.endsWith('ばない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'ぶ');
      }
      if (target.endsWith('まない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'む');
      }
      if (target.endsWith('らない')) {
        const base = target.slice(0, -3);
        if (base.length >= 1) addCand(base + 'る');
      }
    }

    // 5. Desconjugación de la forma progresiva / estado (-te imasu / -te iru / -te ita / -te imashita)
    if (/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/.test(target)) {
      const teForm = target.replace(/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/, (m) => m.startsWith('で') ? 'で' : 'て');
      for (const c of deconjugateJapanese(teForm)) {
        addCand(c);
      }
    }

    // 6. Desconjugación de formas corteses derivadas (-mashita, -masen, -masendeshita, -mashou, -tai, -takunai)
    if (/(ました|ませんでした|ません|ましょう|たい|たくない)$/.test(target)) {
      const masuForm = target.replace(/(ました|ませんでした|ません|ましょう|たい|たくない)$/, 'ます');
      for (const c of deconjugateJapanese(masuForm)) {
        addCand(c);
      }
    }

    // 7. Desconjugación de formas negativas derivadas (-nakatta, -nakute, -naide)
    if (/(なかった|なくて|ないで)$/.test(target)) {
      const naiForm = target.replace(/(なかった|なくて|ないで)$/, 'ない');
      for (const c of deconjugateJapanese(naiForm)) {
        addCand(c);
      }
    }
  };

  runRulesOnString(normalized);
  if (clean !== normalized && !/[\u4e00-\u9faf]$/.test(clean)) {
    runRulesOnString(clean);
  }

  return Array.from(candidates).filter(
    (c) => c.length >= 2 && !/[\u4e00-\u9faf]$/.test(c) && !COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(c)
  );
}

/**
 * Clasifica heurísticamente una palabra japonesa en su categoría gramatical (Part of Speech).
 */
export function classifyJapaneseWord(word: string, reading?: string): string {
  if (!word) return 'Sustantivo';
  const cleanWord = word.trim();
  if (cleanWord.length === 0) return 'Sustantivo';

  const knownNaAdj = [
    'だいじょうぶ', 'ゆうめい', 'べんり', 'げんき', 'しずか', 'ひま', 'しんせつ',
    'かんたん', 'すき', 'きらい', 'きれい', 'あんぜん', 'じょうず', 'へた',
    'たいせつ', 'とくべつ', 'ひつよう', 'じゆう', 'ざんねん', 'すてき',
    'たいへん', 'さまざま', 'ふくざつ', 'まじめ', 'にぎやか', 'ふべん'
  ];

  let clean = (reading || word).trim();
  if (clean.includes('Kun:')) {
    const m = clean.match(/Kun:\s*([^•|\n]+)/i);
    if (m) clean = m[1].trim();
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts[1]) clean = parts[1].trim();
  }
  clean = clean.replace(/^(on|kun)[:：\s]*/i, '').replace(/[・\-\~]/g, '').trim();

  // 1. Caso Tarjeta de un solo Kanji (ej. 立, 聞, 行, 見, 食, 飲, 高, 新)
  if (cleanWord.length === 1 && /[\u4e00-\u9faf]/.test(cleanWord)) {
    const normalizedReading = toNormalizedHiragana(clean);
    if (
      normalizedReading &&
      normalizedReading.length >= 2 &&
      !COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(normalizedReading)
    ) {
      if (normalizedReading.endsWith('い')) return 'Adjetivo -i';
      if (normalizedReading === 'くる' || normalizedReading === 'する') return 'Verbo Irregular';
      if (normalizedReading.endsWith('る')) {
        const prevChar = normalizedReading[normalizedReading.length - 2];
        const ichidanPrevs = [
          'い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ',
          'え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'
        ];
        const godanExceptions = ['かえる', 'しる', 'きる', 'はいる', 'はしる', 'へる', 'しゃべる', 'すべる'];
        if (ichidanPrevs.includes(prevChar) && !godanExceptions.includes(normalizedReading)) {
          return 'Verbo Ichidan (-ru)';
        }
        return 'Verbo Godan (-ru)';
      }
      if (/[うくぐすつぬぶむ]/.test(normalizedReading[normalizedReading.length - 1])) {
        return 'Verbo Godan (-u)';
      }
    }
    // Sustantivos individuales (ej. 右, 犬, 肉, 本)
    return 'Sustantivo';
  }

  // 2. Si tiene 2 o más kanjis y termina en kanji (sustantivo compuesto como 学校, 今日, 先生, 世界):
  const endsWithKanji = /[\u4e00-\u9faf]$/.test(cleanWord);
  if (cleanWord.length > 1 && endsWithKanji) {
    if (knownNaAdj.includes(cleanWord) || cleanWord.endsWith('的')) {
      return 'Adjetivo -na';
    }
    return 'Sustantivo';
  }

  if (cleanWord.length < 2) {
    return 'Sustantivo';
  }

  const normalized = toNormalizedHiragana(clean);
  if (normalized.length < 2) return 'Sustantivo';

  if (COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(normalized)) {
    return 'Sustantivo';
  }

  // Frase u oración larga
  if (word.includes(' ') || normalized.length >= 16 || /[。！？]/.test(clean)) {
    return 'Frase / Expresión';
  }

  // Verbos Irregulares (hacer / venir)
  if (normalized === 'する' || cleanWord.endsWith('する') || normalized.endsWith('する')) {
    return 'Verbo Irregular';
  }
  if (normalized === 'くる' || cleanWord.endsWith('くる') || cleanWord.endsWith('来る')) {
    return 'Verbo Irregular';
  }

  // Adjetivos -i (terminan en い precedido de vocal y no son excepciones sustantivas conocidas)
  if (normalized.length >= 2 && normalized.endsWith('い')) {
    // Si contiene kanji, la propia palabra escrita DEBE terminar en 'い'
    if (!/[\u4e00-\u9faf]/.test(cleanWord) || cleanWord.endsWith('い')) {
      const prevChar = normalized[normalized.length - 2];
      // Excepciones conocidas sustantivos: 綺麗 (kirei -> na), 嫌い (kirai -> na)
      if (cleanWord === '綺麗' || normalized === 'きれい') return 'Adjetivo -na';
      if (cleanWord === '嫌い' || normalized === 'きらい') return 'Adjetivo -na';
      if (['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'ら', 'り', 'る', 'れ', 'ろ', 'わ'].includes(prevChar)) {
        return 'Adjetivo -i';
      }
    }
  }

  // Verbos Ichidan (terminados en る precedido de sonido i o e)
  if (normalized.endsWith('る') && normalized.length >= 2) {
    // Si contiene kanji, la palabra escrita DEBE terminar en 'る'
    if (!/[\u4e00-\u9faf]/.test(cleanWord) || cleanWord.endsWith('る')) {
      const prevChar = normalized[normalized.length - 2];
      const ichidanPrevs = [
        'い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ',
        'え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'
      ];
      // Excepciones conocidas Godan que terminan en iru/eru: 帰る (kaeru), 知る (shiru), 切る (kiru), 入る (hairu), 走る (hashiru)
      const godanExceptions = ['かえる', 'しる', 'きる', 'はいる', 'はしる', 'へる', 'しゃべる', 'すべる'];
      if (ichidanPrevs.includes(prevChar) && !godanExceptions.includes(normalized)) {
        return 'Verbo Ichidan (-ru)';
      }
      return 'Verbo Godan (-ru)';
    }
  }

  // Adjetivos -na comunes o terminados en な
  if (knownNaAdj.includes(normalized) || knownNaAdj.some(na => clean.startsWith(na))) {
    return 'Adjetivo -na';
  }

  // Verbos Godan (terminados en う, く, ぐ, す, つ, ぬ, ぶ, む)
  if (/[うくぐすつぬぶむ]/.test(normalized[normalized.length - 1])) {
    // Si contiene kanji, la propia palabra DEBE terminar en uno de [うくぐすつぬぶむ]
    if (!/[\u4e00-\u9faf]/.test(cleanWord) || /[うくぐすつぬぶむ]$/.test(cleanWord)) {
      return 'Verbo Godan (-u)';
    }
  }

  // Adjetivos -na terminados en な
  if (normalized.endsWith('な') && normalized.length > 2) {
    return 'Adjetivo -na';
  }

  return 'Sustantivo';
}

/**
 * Determina si una palabra en japonés se encuentra en su forma de diccionario base (Jisho-kei).
 * Excluye formas ya conjugadas (-masu, -te, -ta, -nai, etc.).
 */
export function isJapaneseDictionaryForm(
  word: string,
  reading: string = '',
  category: string = ''
): boolean {
  if (!word) return false;
  const cleanWord = word.trim();
  // 1. REGLA FUNDAMENTAL: si termina en kanji o longitud < 2, NUNCA es forma de diccionario conjugable
  if (cleanWord.length < 2 || /[\u4e00-\u9faf]$/.test(cleanWord)) {
    return false;
  }

  const hira = toNormalizedHiragana(reading || cleanWord);
  if (!hira || hira.length < 2) return false;

  // Frases o expresiones o sustantivos comunes en kana no son conjugables
  if (category === 'Sustantivo' || category.includes('Frase') || cleanWord.includes(' ') || hira.length >= 16 || /[。！？]/.test(cleanWord)) {
    return false;
  }
  if (COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(hira)) {
    return false;
  }

  // 1. Excluir explícitamente formas ya conjugadas:
  // Forma -masu / -desu (-ます, -ました, -ません, -ませんでした, -ましょう, -です, -でした)
  if (
    hira.endsWith('ます') ||
    hira.endsWith('ました') ||
    hira.endsWith('ません') ||
    hira.endsWith('ませんでした') ||
    hira.endsWith('ましょう') ||
    (hira.endsWith('です') && hira !== 'です') ||
    (hira.endsWith('でした') && hira !== 'でした')
  ) {
    return false;
  }

  // Forma -te / -nakute / -naide (-て, -で, -くて, -なくて, -ないで)
  if (
    hira.endsWith('て') ||
    hira.endsWith('で') ||
    hira.endsWith('なくて') ||
    hira.endsWith('ないで')
  ) {
    return false;
  }

  // Forma -ta / -datta (-た, -だ, -った, -いた, -いだ, -した, -んだ, -かった, -だった)
  if (
    hira.endsWith('った') ||
    hira.endsWith('いた') ||
    hira.endsWith('いだ') ||
    hira.endsWith('した') ||
    hira.endsWith('んだ') ||
    hira.endsWith('かった') ||
    hira.endsWith('だった')
  ) {
    return false;
  }

  // Forma -nai / -nakatta (-ない, -なかった, -くなかった, -じゃなかった)
  if (hira.endsWith('ない') || hira.endsWith('なかった') || hira.endsWith('じゃなかった')) {
    // Excepciones de adjetivos base que terminan en ない: 少ない (sukunai), 危ない (abunai), 汚い (kitanai)
    const baseAdjExceptions = ['すくない', 'あぶない', 'きたない', 'もったいない', 'だらしない'];
    if (!baseAdjExceptions.includes(hira) && (category.startsWith('Verbo') || hira.endsWith('じゃない') || hira.endsWith('なかった'))) {
      return false;
    }
  }

  // 2. Si es Verbo Irregular: debe terminar en する o くる / 来る
  if (category.includes('Irregular') || hira.endsWith('する') || hira.endsWith('くる') || cleanWord.endsWith('来る')) {
    return hira.endsWith('する') || hira.endsWith('くる') || cleanWord.endsWith('来る');
  }

  // 3. Si es Verbo Ichidan: debe terminar en る (y la palabra escrita también si tiene kanji)
  if (category.includes('Ichidan')) {
    return hira.endsWith('る') && (!/[\u4e00-\u9faf]/.test(cleanWord) || cleanWord.endsWith('る'));
  }

  // 4. Si es Verbo Godan: debe terminar en u (う, く, ぐ, す, つ, ぬ, ぶ, む, る)
  if (category.includes('Godan')) {
    return /[うくぐすつぬぶむる]$/.test(hira) && (!/[\u4e00-\u9faf]/.test(cleanWord) || /[うくぐすつぬぶむる]$/.test(cleanWord));
  }

  // 5. Si es Adjetivo -i: debe terminar en い
  if (category.includes('Adjetivo -i')) {
    return hira.endsWith('い') && (!/[\u4e00-\u9faf]/.test(cleanWord) || cleanWord.endsWith('い'));
  }

  // 6. Si es Adjetivo -na:
  if (category.includes('Adjetivo -na')) {
    return !hira.endsWith('だった') && !hira.endsWith('じゃない') && !hira.endsWith('でした');
  }

  // Si no tiene categoría explícita pero termina en terminación verbal de diccionario
  if (category.startsWith('Verbo')) {
    return /[うくぐすつぬぶむる]$/.test(hira) && (!/[\u4e00-\u9faf]/.test(cleanWord) || /[うくぐすつぬぶむる]$/.test(cleanWord));
  }

  if (category.startsWith('Adjetivo')) {
    return (hira.endsWith('い') && (!/[\u4e00-\u9faf]/.test(cleanWord) || cleanWord.endsWith('い'))) || !hira.endsWith('じゃない');
  }

  return false;
}

export type JapaneseConjugationForm =
  | 'te'
  | 'nakute'
  | 'ta'
  | 'nai'
  | 'nakatta'
  | 'adverbial'
  | 'masu'
  | 'mashita'
  | 'masen'
  | 'mashou';

/**
 * Conjuga un verbo o adjetivo japonés a la forma deseada:
 * - 'te': Forma -TE (〜て / 〜で / 〜くて)
 * - 'nakute': Forma -TE Negativa (〜なくて / 〜ないで / 〜くなくて / 〜じゃなくて)
 * - 'ta': Pasado informal afirmativo (〜た / 〜だ / 〜かった / 〜だった)
 * - 'nai': Negativo informal (〜ない / 〜くない / 〜じゃない)
 * - 'nakatta': Pasado informal negativo (〜なかった / 〜くなかった / 〜じゃなかった)
 * - 'adverbial': Forma adverbial (〜く / 〜に)
 * - 'masu': Presente formal afirmativo (〜ます / 〜です)
 * - 'mashita': Pasado formal afirmativo (〜ました / 〜でした / 〜かったです)
 * - 'masen': Negativo formal (〜ません / 〜じゃありません / 〜くないです)
 * - 'mashou': Forma -mashou (invitación / 〜ましょう)
 */
export function conjugateJapanese(
  word: string,
  reading: string,
  category: string,
  form: JapaneseConjugationForm
): { kanji: string; reading: string } {
  const cleanWord = word.trim();
  const cleanReading = (reading || word).trim();
  const hira = toNormalizedHiragana(cleanReading);

  const isAdjNa = category.includes('Adjetivo -na') || (category.startsWith('Adjetivo') && !hira.endsWith('い'));
  const isAdjI = category.includes('Adjetivo -i') || (category.startsWith('Adjetivo') && hira.endsWith('い')) || (!category.includes('Verbo') && !isAdjNa && hira.endsWith('い'));
  const isIrregular = !isAdjNa && !isAdjI && (category.includes('Irregular') || cleanWord.endsWith('する') || cleanWord.endsWith('くる') || cleanWord === '来る');
  const isIchidan = !isAdjNa && !isAdjI && !isIrregular && category.includes('Ichidan');
  const isGodan = !isAdjNa && !isAdjI && !isIrregular && !isIchidan && (category.includes('Godan') || (!category.includes('Sustantivo') && /[うくぐすつぬぶむる]$/.test(hira)));

  // 1. Verbos Irregulares: する y くる
  if (isIrregular) {
    if (hira === 'する' || hira.endsWith('する')) {
      const kStem = cleanWord.endsWith('する') ? cleanWord.slice(0, -2) : '';
      const rStem = hira.slice(0, -2);
      if (form === 'te') return { kanji: `${kStem}して`, reading: `${rStem}して` };
      if (form === 'nakute') return { kanji: `${kStem}しなくて`, reading: `${rStem}しなくて` };
      if (form === 'ta') return { kanji: `${kStem}した`, reading: `${rStem}した` };
      if (form === 'nai') return { kanji: `${kStem}しない`, reading: `${rStem}しない` };
      if (form === 'nakatta') return { kanji: `${kStem}しなかった`, reading: `${rStem}しなかった` };
      if (form === 'masu') return { kanji: `${kStem}します`, reading: `${rStem}します` };
      if (form === 'mashita') return { kanji: `${kStem}しました`, reading: `${rStem}しました` };
      if (form === 'masen') return { kanji: `${kStem}しません`, reading: `${rStem}しません` };
      if (form === 'mashou') return { kanji: `${kStem}しましょう`, reading: `${rStem}しましょう` };
      return { kanji: cleanWord, reading: cleanReading };
    }
    if (hira === 'くる' || hira.endsWith('くる') || cleanWord.endsWith('来る')) {
      if (form === 'te') return { kanji: '来て', reading: 'きて' };
      if (form === 'nakute') return { kanji: '来なくて', reading: 'こなくて' };
      if (form === 'ta') return { kanji: '来た', reading: 'きた' };
      if (form === 'nai') return { kanji: '来ない', reading: 'こない' };
      if (form === 'nakatta') return { kanji: '来なかった', reading: 'こなかった' };
      if (form === 'masu') return { kanji: '来ます', reading: 'きます' };
      if (form === 'mashita') return { kanji: '来ました', reading: 'きました' };
      if (form === 'masen') return { kanji: '来ません', reading: 'きません' };
      if (form === 'mashou') return { kanji: '来ましょう', reading: 'きましょう' };
      return { kanji: cleanWord, reading: cleanReading };
    }
  }

  // 2. Verbos Ichidan (quitar る)
  if (isIchidan && hira.endsWith('る')) {
    const kStem = cleanWord.endsWith('る') ? cleanWord.slice(0, -1) : cleanWord;
    const rStem = hira.slice(0, -1);
    if (form === 'te') return { kanji: `${kStem}て`, reading: `${rStem}て` };
    if (form === 'nakute') return { kanji: `${kStem}なくて`, reading: `${rStem}なくて` };
    if (form === 'ta') return { kanji: `${kStem}た`, reading: `${rStem}た` };
    if (form === 'nai') return { kanji: `${kStem}ない`, reading: `${rStem}ない` };
    if (form === 'nakatta') return { kanji: `${kStem}なかった`, reading: `${rStem}なかった` };
    if (form === 'masu') return { kanji: `${kStem}ます`, reading: `${rStem}ます` };
    if (form === 'mashita') return { kanji: `${kStem}ました`, reading: `${rStem}ました` };
    if (form === 'masen') return { kanji: `${kStem}ません`, reading: `${rStem}ません` };
    if (form === 'mashou') return { kanji: `${kStem}ましょう`, reading: `${rStem}ましょう` };
    return { kanji: cleanWord, reading: cleanReading };
  }

  // 3. Verbos Godan
  if (isGodan) {
    const lastChar = hira[hira.length - 1];
    const kStem = cleanWord.length > 0 ? cleanWord.slice(0, -1) : '';
    const rStem = hira.slice(0, -1);

    // Caso especial: 行く (iku)
    if (cleanWord === '行く' || hira === 'いく') {
      if (form === 'te') return { kanji: '行って', reading: 'いって' };
      if (form === 'nakute') return { kanji: '行かなくて', reading: 'いかなくて' };
      if (form === 'ta') return { kanji: '行った', reading: 'いった' };
      if (form === 'nai') return { kanji: '行かない', reading: 'いかない' };
      if (form === 'nakatta') return { kanji: '行かなかった', reading: 'いかなかった' };
      if (form === 'masu') return { kanji: '行きます', reading: 'いきます' };
      if (form === 'mashita') return { kanji: '行きました', reading: 'いきました' };
      if (form === 'masen') return { kanji: '行きません', reading: 'いきません' };
      if (form === 'mashou') return { kanji: '行きましょう', reading: 'いきましょう' };
      return { kanji: cleanWord, reading: cleanReading };
    }

    if (lastChar === 'う') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'nakute') return { kanji: `${kStem}わなくて`, reading: `${rStem}わなくて` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}わない`, reading: `${rStem}わない` };
      if (form === 'nakatta') return { kanji: `${kStem}わなかった`, reading: `${rStem}わなかった` };
      if (form === 'masu') return { kanji: `${kStem}います`, reading: `${rStem}います` };
      if (form === 'mashita') return { kanji: `${kStem}いました`, reading: `${rStem}いました` };
      if (form === 'masen') return { kanji: `${kStem}いません`, reading: `${rStem}いません` };
      if (form === 'mashou') return { kanji: `${kStem}いましょう`, reading: `${rStem}いましょう` };
    }
    if (lastChar === 'つ') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'nakute') return { kanji: `${kStem}たなくて`, reading: `${rStem}たなくて` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}たない`, reading: `${rStem}たない` };
      if (form === 'nakatta') return { kanji: `${kStem}たなかった`, reading: `${rStem}たなかった` };
      if (form === 'masu') return { kanji: `${kStem}ちます`, reading: `${rStem}ちます` };
      if (form === 'mashita') return { kanji: `${kStem}ちました`, reading: `${rStem}ちました` };
      if (form === 'masen') return { kanji: `${kStem}ちません`, reading: `${rStem}ちません` };
      if (form === 'mashou') return { kanji: `${kStem}ちましょう`, reading: `${rStem}ちましょう` };
    }
    if (lastChar === 'る') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'nakute') return { kanji: `${kStem}らなくて`, reading: `${rStem}らなくて` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}らない`, reading: `${rStem}らない` };
      if (form === 'nakatta') return { kanji: `${kStem}らなかった`, reading: `${rStem}らなかった` };
      if (form === 'masu') return { kanji: `${kStem}ります`, reading: `${rStem}ります` };
      if (form === 'mashita') return { kanji: `${kStem}りました`, reading: `${rStem}りました` };
      if (form === 'masen') return { kanji: `${kStem}りません`, reading: `${rStem}りません` };
      if (form === 'mashou') return { kanji: `${kStem}りましょう`, reading: `${rStem}りましょう` };
    }
    if (lastChar === 'く') {
      if (form === 'te') return { kanji: `${kStem}いて`, reading: `${rStem}いて` };
      if (form === 'nakute') return { kanji: `${kStem}かなくて`, reading: `${rStem}かなくて` };
      if (form === 'ta') return { kanji: `${kStem}いた`, reading: `${rStem}いた` };
      if (form === 'nai') return { kanji: `${kStem}かない`, reading: `${rStem}かない` };
      if (form === 'nakatta') return { kanji: `${kStem}かなかった`, reading: `${rStem}かなかった` };
      if (form === 'masu') return { kanji: `${kStem}きます`, reading: `${rStem}きます` };
      if (form === 'mashita') return { kanji: `${kStem}きました`, reading: `${rStem}きました` };
      if (form === 'masen') return { kanji: `${kStem}きません`, reading: `${rStem}きません` };
      if (form === 'mashou') return { kanji: `${kStem}きましょう`, reading: `${rStem}きましょう` };
    }
    if (lastChar === 'ぐ') {
      if (form === 'te') return { kanji: `${kStem}いで`, reading: `${rStem}いで` };
      if (form === 'nakute') return { kanji: `${kStem}がなくて`, reading: `${rStem}がなくて` };
      if (form === 'ta') return { kanji: `${kStem}いだ`, reading: `${rStem}いだ` };
      if (form === 'nai') return { kanji: `${kStem}がない`, reading: `${rStem}がない` };
      if (form === 'nakatta') return { kanji: `${kStem}がなかった`, reading: `${rStem}がなかった` };
      if (form === 'masu') return { kanji: `${kStem}ぎます`, reading: `${rStem}ぎます` };
      if (form === 'mashita') return { kanji: `${kStem}ぎました`, reading: `${rStem}ぎました` };
      if (form === 'masen') return { kanji: `${kStem}ぎません`, reading: `${rStem}ぎません` };
      if (form === 'mashou') return { kanji: `${kStem}ぎましょう`, reading: `${rStem}ぎましょう` };
    }
    if (lastChar === 'す') {
      if (form === 'te') return { kanji: `${kStem}して`, reading: `${rStem}して` };
      if (form === 'nakute') return { kanji: `${kStem}さなくて`, reading: `${rStem}さなくて` };
      if (form === 'ta') return { kanji: `${kStem}した`, reading: `${rStem}した` };
      if (form === 'nai') return { kanji: `${kStem}さない`, reading: `${rStem}さない` };
      if (form === 'nakatta') return { kanji: `${kStem}さなかった`, reading: `${rStem}さなかった` };
      if (form === 'masu') return { kanji: `${kStem}します`, reading: `${rStem}します` };
      if (form === 'mashita') return { kanji: `${kStem}しました`, reading: `${rStem}しました` };
      if (form === 'masen') return { kanji: `${kStem}しません`, reading: `${rStem}しません` };
      if (form === 'mashou') return { kanji: `${kStem}しましょう`, reading: `${rStem}しましょう` };
    }
    if (lastChar === 'む' || lastChar === 'ぶ' || lastChar === 'ぬ') {
      const naiPrefix = lastChar === 'む' ? 'ま' : lastChar === 'ぶ' ? 'ば' : 'な';
      const masuPrefix = lastChar === 'む' ? 'み' : lastChar === 'ぶ' ? 'び' : 'に';
      if (form === 'te') return { kanji: `${kStem}んで`, reading: `${rStem}んで` };
      if (form === 'nakute') return { kanji: `${kStem}${naiPrefix}なくて`, reading: `${rStem}${naiPrefix}なくて` };
      if (form === 'ta') return { kanji: `${kStem}んだ`, reading: `${rStem}んだ` };
      if (form === 'nai') return { kanji: `${kStem}${naiPrefix}ない`, reading: `${rStem}${naiPrefix}ない` };
      if (form === 'nakatta') return { kanji: `${kStem}${naiPrefix}なかった`, reading: `${rStem}${naiPrefix}なかった` };
      if (form === 'masu') return { kanji: `${kStem}${masuPrefix}ます`, reading: `${rStem}${masuPrefix}ます` };
      if (form === 'mashita') return { kanji: `${kStem}${masuPrefix}ました`, reading: `${rStem}${masuPrefix}ました` };
      if (form === 'masen') return { kanji: `${kStem}${masuPrefix}ません`, reading: `${rStem}${masuPrefix}ません` };
      if (form === 'mashou') return { kanji: `${kStem}${masuPrefix}ましょう`, reading: `${rStem}${masuPrefix}ましょう` };
    }
    return { kanji: cleanWord, reading: cleanReading };
  }

  // 4. Adjetivos -i
  if (isAdjI && (hira.endsWith('い') || cleanWord === '良い')) {
    // Caso especial: いい (ii) / 良い (yoi) -> yokute, yokunakute, yokatta, yokunai, yokunakatta, yoku, etc.
    if (cleanWord === 'いい' || hira === 'いい' || cleanWord === '良い' || hira === 'よい') {
      const kPrefix = cleanWord === '良い' ? '良' : 'よ';
      if (form === 'te') return { kanji: `${kPrefix}くて`, reading: 'よくて' };
      if (form === 'nakute') return { kanji: `${kPrefix}くなくて`, reading: 'よくなくて' };
      if (form === 'ta') return { kanji: `${kPrefix}かった`, reading: 'よかった' };
      if (form === 'nai') return { kanji: `${kPrefix}くない`, reading: 'よくない' };
      if (form === 'nakatta') return { kanji: `${kPrefix}くなかった`, reading: 'よくなかった' };
      if (form === 'adverbial') return { kanji: `${kPrefix}く`, reading: 'よく' };
      if (form === 'masu') return { kanji: cleanWord === '良い' ? '良いです' : 'いいです', reading: 'いいです' };
      if (form === 'mashita') return { kanji: `${kPrefix}かったです`, reading: 'よかったです' };
      if (form === 'masen') return { kanji: `${kPrefix}くないです`, reading: 'よくないです' };
      return { kanji: cleanWord, reading: cleanReading };
    }

    const kStem = cleanWord.endsWith('い') ? cleanWord.slice(0, -1) : cleanWord;
    const rStem = hira.slice(0, -1);
    if (form === 'te') return { kanji: `${kStem}くて`, reading: `${rStem}くて` };
    if (form === 'nakute') return { kanji: `${kStem}くなくて`, reading: `${rStem}くなくて` };
    if (form === 'ta') return { kanji: `${kStem}かった`, reading: `${rStem}かった` };
    if (form === 'nai') return { kanji: `${kStem}くない`, reading: `${rStem}くない` };
    if (form === 'nakatta') return { kanji: `${kStem}くなかった`, reading: `${rStem}くなかった` };
    if (form === 'adverbial') return { kanji: `${kStem}く`, reading: `${rStem}く` };
    if (form === 'masu') return { kanji: `${cleanWord}です`, reading: `${hira}です` };
    if (form === 'mashita') return { kanji: `${kStem}かったです`, reading: `${rStem}かったです` };
    if (form === 'masen') return { kanji: `${kStem}くないです`, reading: `${rStem}くないです` };
    return { kanji: cleanWord, reading: cleanReading };
  }

  // 5. Adjetivos -na
  if (isAdjNa) {
    const baseK = cleanWord.endsWith('な') ? cleanWord.slice(0, -1) : cleanWord;
    const baseR = hira.endsWith('な') ? hira.slice(0, -1) : hira;
    if (form === 'te') return { kanji: `${baseK}で`, reading: `${baseR}で` };
    if (form === 'nakute') return { kanji: `${baseK}じゃなくて`, reading: `${baseR}じゃなくて` };
    if (form === 'ta') return { kanji: `${baseK}だった`, reading: `${baseR}だった` };
    if (form === 'nai') return { kanji: `${baseK}じゃない`, reading: `${baseR}じゃない` };
    if (form === 'nakatta') return { kanji: `${baseK}じゃなかった`, reading: `${baseR}じゃなかった` };
    if (form === 'adverbial') return { kanji: `${baseK}に`, reading: `${baseR}に` };
    if (form === 'masu') return { kanji: `${baseK}です`, reading: `${baseR}です` };
    if (form === 'mashita') return { kanji: `${baseK}でした`, reading: `${baseR}でした` };
    if (form === 'masen') return { kanji: `${baseK}じゃありません`, reading: `${baseR}じゃありません` };
    return { kanji: cleanWord, reading: cleanReading };
  }

  // Fallback seguro
  return { kanji: cleanWord, reading: cleanReading };
}

/**
 * Limpia y embellece lecturas de Kanji / Vocabulario japonés:
 * - Elimina puntos centrales molestos de okurigana (・)
 * - Si contiene On'yomi y Kun'yomi (separados por /), los presenta con formato limpio: "On: ...  •  Kun: ..."
 */
export function formatJapaneseReading(reading: string): string {
  if (!reading) return '';
  let clean = reading.replace(/[・]/g, '').trim();

  // Si ya tiene formato On/Kun explícito, devolver limpia de puntos
  if (/\b(on|kun)\b/i.test(clean)) {
    return clean;
  }

  // Si tiene formato tradicional "Katakana / Hiragana"
  if (clean.includes('/')) {
    const parts = clean.split('/').map((p) => p.trim());
    if (parts.length === 2) {
      const isPart0Katakana = /^[\u30a0-\u30ff\s,、]+$/.test(parts[0]);
      const isPart1Hiragana = /^[\u3040-\u309f\s,、\-\~]+$/.test(parts[1]);
      if (isPart0Katakana && isPart1Hiragana) {
        return `On: ${parts[0]}  •  Kun: ${parts[1]}`;
      }
    }
  }

  return clean;
}

export const DAY_DATA = [
  { day: 1, kanji: '一日', morpheme: 'ついたち', kana: 'ついたち', altKanji: '1日' },
  { day: 2, kanji: '二日', morpheme: 'ふつか', kana: 'ふつか', altKanji: '2日' },
  { day: 3, kanji: '三日', morpheme: 'みっ か', kana: 'みっか', altKanji: '3日' },
  { day: 4, kanji: '四日', morpheme: 'よっ か', kana: 'よっか', altKanji: '4日' },
  { day: 5, kanji: '五日', morpheme: 'いつか', kana: 'いつか', altKanji: '5日' },
  { day: 6, kanji: '六日', morpheme: 'むい か', kana: 'むいか', altKanji: '6日' },
  { day: 7, kanji: '七日', morpheme: 'なのか', kana: 'なのか', altKanji: '7日' },
  { day: 8, kanji: '八日', morpheme: 'ようか', kana: 'ようか', altKanji: '8日' },
  { day: 9, kanji: '九日', morpheme: 'ここの か', kana: 'ここのか', altKanji: '9日' },
  { day: 10, kanji: '十日', morpheme: 'とお か', kana: 'とおか', altKanji: '10日' },
  { day: 11, kanji: '十一日', morpheme: '十 一 日', kana: 'じゅういちにち', altKanji: '11日' },
  { day: 12, kanji: '十二日', morpheme: '十 二 日', kana: 'じゅうににち', altKanji: '12日' },
  { day: 13, kanji: '十三日', morpheme: '十 三 日', kana: 'じゅうさんにち', altKanji: '13日' },
  { day: 14, kanji: '十四日', morpheme: 'じゅう よっ か', kana: 'じゅうよっか', altKanji: '14日' },
  { day: 15, kanji: '十五日', morpheme: '十 五 日', kana: 'じゅうごにち', altKanji: '15日' },
  { day: 16, kanji: '十六日', morpheme: '十 六 日', kana: 'じゅうろくにち', altKanji: '16日' },
  { day: 17, kanji: '十七日', morpheme: '十 七 日', kana: 'じゅうしちにち', altKanji: '17日' },
  { day: 18, kanji: '十八日', morpheme: '十 八 日', kana: 'じゅうはちにち', altKanji: '18日' },
  { day: 19, kanji: '十九日', morpheme: '十 九 日', kana: 'じゅうくにち', altKanji: '19日' },
  { day: 20, kanji: '二十日', morpheme: 'はつか', kana: 'はつか', altKanji: '20日' },
  { day: 21, kanji: '二十一日', morpheme: '二 十 一 日', kana: 'にじゅういちにち', altKanji: '21日' },
  { day: 22, kanji: '二十二日', morpheme: '二 十 二 日', kana: 'にじゅうににち', altKanji: '22日' },
  { day: 23, kanji: '二十三日', morpheme: '二 十 三 日', kana: 'にじゅうさんにち', altKanji: '23日' },
  { day: 24, kanji: '二十四日', morpheme: 'に じゅう よっ か', kana: 'にじゅうよっか', altKanji: '24日' },
  { day: 25, kanji: '二十五日', morpheme: '二 十 五 日', kana: 'にじゅうごにち', altKanji: '25日' },
  { day: 26, kanji: '二十六日', morpheme: '二 十 六 日', kana: 'にじゅうろくにち', altKanji: '26日' },
  { day: 27, kanji: '二十七日', morpheme: '二 十 七 日', kana: 'にじゅうしちにち', altKanji: '27日' },
  { day: 28, kanji: '二十八日', morpheme: '二 十 八 日', kana: 'にじゅうはちにち', altKanji: '28日' },
  { day: 29, kanji: '二十九日', morpheme: '二 十 九 日', kana: 'にじゅうくにち', altKanji: '29日' },
  { day: 30, kanji: '三十日', morpheme: '三 十 日', kana: 'さんじゅうにち', altKanji: '30日' },
  { day: 31, kanji: '三十一日', morpheme: '三 十 一 日', kana: 'さんじゅういちにち', altKanji: '31日' },
];
