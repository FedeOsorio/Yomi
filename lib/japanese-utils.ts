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
 * Normaliza artefactos numéricos generados por Google STT (ej. "5chi" -> "kuchi", "1tsu" -> "ひとつ").
 */
export function expandNumberArtifacts(str: string): string {
  if (!str) return '';
  return str
    .replace(/^5chi$/i, 'kuchi')
    .replace(/^5ち$/i, 'くち')
    .replace(/5chi/gi, 'kuchi')
    .replace(/5ち/g, 'くち')
    .replace(/1tsu/gi, 'ひとつ')
    .replace(/2tsu/gi, 'ふたつ')
    .replace(/3tsu/gi, 'みっつ')
    .replace(/4tsu/gi, 'よっつ')
    .replace(/5tsu/gi, 'いつつ')
    .replace(/6tsu/gi, 'むっつ')
    .replace(/7tsu/gi, 'ななつ')
    .replace(/8tsu/gi, 'やっつ')
    .replace(/9tsu/gi, 'ここのつ')
    .replace(/10tsu/gi, 'とお')
    .replace(/1つ/g, 'ひとつ')
    .replace(/2つ/g, 'ふたつ')
    .replace(/3つ/g, 'みっつ')
    .replace(/4つ/g, 'よっつ')
    .replace(/5つ/g, 'いつつ')
    .replace(/6つ/g, 'むっつ')
    .replace(/7つ/g, 'ななつ')
    .replace(/8つ/g, 'やっつ')
    .replace(/9つ/g, 'ここのつ')
    .replace(/10つ/g, 'とお')
    // Artefactos de ASR generados por Google para "kai" (contador 回 / 階 / 何回 / 1何)
    .replace(/^1何$/i, 'かい')
    .replace(/^1nani$/i, 'かい')
    .replace(/^1kai$/i, 'かい')
    .replace(/^1回$/i, 'かい')
    .replace(/^1階$/i, 'かい')
    .replace(/1何/g, 'かい')
    .replace(/1nani/gi, 'かい')
    .replace(/1kai/gi, 'かい')
    .replace(/1回/g, 'かい')
    .replace(/1階/g, 'かい')
    .replace(/一回/g, 'かい')
    .replace(/一階/g, 'かい')
    .replace(/何回/g, 'かい');
}

/**
 * Convierte una cadena de texto en Romaji a Hiragana (ej. "hon" -> "ほん", "arigatou" -> "ありがとう", "o-i" -> "おおい").
 */
export function romajiToHiragana(romaji: string): string {
  if (!romaji) return '';

  let text = expandNumberArtifacts(romaji.toLowerCase().trim());

  // 1. Normalizar vocales con macron de romanización (ej. ō -> ou, ū -> uu, etc.)
  text = text
    .replace(/[āáàâ]/g, 'aa')
    .replace(/[īíìî]/g, 'ii')
    .replace(/[ūúùû]/g, 'uu')
    .replace(/[ēéèê]/g, 'ee')
    .replace(/[ōóòô]/g, 'ou');

  // 2. Convertir vocal seguida de guión a vocal alargada (ej. "o-i" -> "ooi", "shu-" -> "shuu")
  // y eliminar cualquier guión remanente porque en Hiragana no se usan guiones
  text = text.replace(/([aiueo])-/g, '$1$1').replace(/[-_]/g, '');

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
      if (i + 1 === text.length || (!['a', 'i', 'u', 'e', 'o', 'y'].includes(text[i + 1]) && text[i + 1] !== "'")) {
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
 * Determina con precisión el idioma real de una tarjeta o mazo.
 * Si el texto o la lectura contienen caracteres Kana (Hiragana o Katakana),
 * o si coinciden con kanjis japoneses conocidos o lecturas japonesas,
 * es 100% Japonés ('ja-JP'), evitando que el micrófono se configure en Chino
 * si el mazo fue creado con 'zh-CN' por defecto en versiones previas.
 */
export function getEffectiveCardLanguage(card?: {
  displayText?: string | null;
  displayReading?: string | null;
  auxiliaryInfo?: string | null;
  languageCode?: string | null;
  deckType?: string | null;
} | null): string {
  if (!card) return 'ja-JP';

  const reading = (card.displayReading || '').trim();
  const text = (card.displayText || '').trim();
  const aux = (card.auxiliaryInfo || '').trim();

  // 1. Si la lectura, el texto o la info auxiliar contienen Kana (Hiragana o Katakana), es indiscutiblemente Japonés
  if (/[\u3040-\u30ff]/.test(reading) || /[\u3040-\u30ff]/.test(text) || /[\u3040-\u30ff]/.test(aux)) {
    return 'ja-JP';
  }

  // 2. Si la tarjeta o mazo tiene un languageCode explícito configurado
  if (card.languageCode) {
    if (card.languageCode.startsWith('zh')) return 'zh-CN';
    if (card.languageCode.startsWith('ja')) return 'ja-JP';
    if (card.languageCode.startsWith('es')) return 'es-ES';
    if (card.languageCode.startsWith('en')) return 'en-US';
  }

  // 3. Si explícitamente se configuró como mazo personalizado o español y NO contiene caracteres japoneses
  if (card.deckType === 'custom' || card.languageCode === 'custom' || card.languageCode === 'es-ES') {
    return 'es-ES';
  }

  // 4. Si la lectura contiene marcas de tono Pinyin chinas (ā, á, ǎ, à, etc.) o números de tono
  const hasChinesePinyin = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(reading) || /\b[a-z]+[1-5]\b/i.test(reading);
  if (hasChinesePinyin) {
    return 'zh-CN';
  }

  // 5. Si el texto contiene caracteres Kanji registrados en nuestro mapa de lecturas japonés
  for (let i = 0; i < text.length; i++) {
    if (UNIVERSAL_KANJI_READINGS_MAP[text[i]]) return 'ja-JP';
  }

  // 6. Fallback por defecto seguro: si la tarjeta no tiene indicios de chino u otro idioma, asumir Japonés
  return 'ja-JP';
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

// Exportados para compatibilidad de tipos (obsoletos: reemplazados por READING_TO_KANJI_INDEX y kanji-readings-db universal)
export const ASR_MONOSYLLABLE_MAP: Record<string, string> = {};
export const ASR_HOMOPHONE_KANJI_MAP: Record<string, string> = {};

// Índice invertido universal: reading (kana) -> kanji[] para los 2.678 kanji
const READING_TO_KANJI_INDEX = new Map<string, string[]>();
for (const [kanji, readings] of Object.entries(UNIVERSAL_KANJI_READINGS_MAP)) {
  for (const r of readings) {
    const list = READING_TO_KANJI_INDEX.get(r);
    if (list) {
      list.push(kanji);
    } else {
      READING_TO_KANJI_INDEX.set(r, [kanji]);
    }
  }
}

export function getKanjiHomophonesForReading(kanaReading: string): string[] {
  return READING_TO_KANJI_INDEX.get(kanaReading) || [];
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
  const cleanInput = text.toLowerCase().trim();

  let result = expandNumberArtifacts(cleanInput);

  // 2. Si contiene kanji conocidos o números de transcripción de voz, resolver fonéticamente
  result = kanjiToHiragana(result);

  // 3. Si contiene caracteres romaji (a-z) o dígitos, convertir a hiragana
  if (/[a-z0-9]/.test(result)) {
    result = romajiToHiragana(result);
  }

  // 4. Convertir katakana a hiragana
  result = katakanaToHiragana(result);

  // 5. Expandir chōonpu (ー / -) a su sonido de vocal largo
  result = expandChoonpu(result);

  // 6. Normalizar vocales pequeñas (ej. 'うぇ' de 'ウェ' -> 'うえ') para coincidencia fonética precisa
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

  // 7. Eliminar dígitos iniciales si quedaron tras artefactos numéricos seguidos de kana (ej. '1かい' -> 'かい')
  result = result.replace(/^[0-9]+([\u3040-\u309f])/, '$1');

  // 8. Eliminar signos de puntuación, puntos japoneses, guiones, espacios y cualquier letra latina residual
  return result.replace(/[\s.,!?;:。、！？・\-_~～\u30fc]/g, '').replace(/[a-zA-Z]/g, '');
}

/**
 * Normaliza dígrafos de 拗音 (Youon - sonidos contraídos como きゃ, ひゃ, しゅ, ちょ)
 * a su forma fonética expandida (きや, ひや, しゆ, ちよ) para salvar la diferencia
 * entre la pronunciación no nativa y el reconocimiento de voz acústico de Google STT.
 */
export function normalizeYouon(kana: string): string {
  if (!kana) return '';
  return kana
    .replace(/きゃ/g, 'きや').replace(/きゅ/g, 'きゆ').replace(/きょ/g, 'きよ')
    .replace(/しゃ/g, 'しや').replace(/しゅ/g, 'しゆ').replace(/しょ/g, 'しよ')
    .replace(/ちゃ/g, 'ちや').replace(/ちゅ/g, 'ちゆ').replace(/ちょ/g, 'ちよ')
    .replace(/にゃ/g, 'にや').replace(/にゅ/g, 'にゆ').replace(/にょ/g, 'によ')
    .replace(/ひゃ/g, 'ひや').replace(/ひゅ/g, 'ひゆ').replace(/ひょ/g, 'ひよ')
    .replace(/みゃ/g, 'みや').replace(/みゅ/g, 'みゆ').replace(/みょ/g, 'みよ')
    .replace(/りゃ/g, 'りや').replace(/りゅ/g, 'りゆ').replace(/りょ/g, 'りよ')
    .replace(/ぎゃ/g, 'ぎや').replace(/ぎゅ/g, 'ぎゆ').replace(/ぎょ/g, 'ぎよ')
    .replace(/じゃ/g, 'じや').replace(/じゅ/g, 'じゆ').replace(/じょ/g, 'じよ')
    .replace(/びゃ/g, 'びや').replace(/びゅ/g, 'びゆ').replace(/びょ/g, 'びよ')
    .replace(/ぴゃ/g, 'ぴや').replace(/ぴゅ/g, 'ぴゆ').replace(/ぴょ/g, 'ぴよ');
}

/**
 * Genera un conjunto rico de variantes fonéticas, kanji homófonos, alargamientos vocálicos y
 * expresiones de cópula (ej. 〜です, 〜の) para sesgar el reconocedor de voz de Google STT
 * en palabras cortas o monosílabos (≤ 2 moras) como 目 [め], 手 [て], 木 [き], 日 [ひ], 上 [うえ], etc.
 */
export function getMonosyllableVariants(reading: string, displayText?: string): string[] {
  if (!reading) return [];
  const hira = toNormalizedHiragana(reading);
  if (!hira || hira.length > 2) return [];

  const variants = new Set<string>();
  const cleanDisplay = (displayText || '').trim();

  // 1. Formas básicas kana
  variants.add(hira);
  const kata = hira.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
  if (kata) variants.add(kata);

  // 2. Formas con sonido prolongado (Google STT casi siempre percibe monosílabos como prolongados)
  variants.add(hira + 'ー');
  if (kata) variants.add(kata + 'ー');
  const expandedHira = expandChoonpu(hira + 'ー');
  if (expandedHira) variants.add(expandedHira);

  // 3. Cópula cortés y partículas (aumenta drásticamente el n-gram prior en Google SpeechRecognizer)
  variants.add(hira + 'です');
  variants.add(hira + 'の');
  if (cleanDisplay) {
    variants.add(cleanDisplay);
    variants.add(cleanDisplay + 'です');
    variants.add(cleanDisplay + 'の');
  }

  // 4. Homófonos de kanji de todo el catálogo universal de 2.678 Kanjis (N5 a N1)
  const homophones = READING_TO_KANJI_INDEX.get(hira);
  if (homophones) {
    for (const k of homophones) {
      variants.add(k);
      variants.add(k + 'です');
    }
  }

  // 5. Romaji sistemático para biasing fonético nativo
  const rom = hiraganaToRomaji(hira);
  if (rom) {
    variants.add(rom);
  }

  return Array.from(variants);
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
 * - 'mashou': Volitiva formal (〜ましょう)
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


