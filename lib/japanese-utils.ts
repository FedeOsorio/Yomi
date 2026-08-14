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
};

/**
 * Convierte una cadena de texto en Romaji a Hiragana (ej. "hon" -> "ほん", "arigatou" -> "ありがとう").
 */
export function romajiToHiragana(romaji: string): string {
  if (!romaji) return '';

  let text = romaji.toLowerCase().trim();
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

    // Caracter no reconocido o ya en kana/kanji/espacio
    result += text[i];
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
