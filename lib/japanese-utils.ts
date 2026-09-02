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

/**
 * Convierte caracteres Katakana a Hiragana.
 */
export function katakanaToHiragana(text: string): string {
  if (!text) return '';
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * Normaliza cualquier texto en japonés (Romaji, Katakana o Hiragana) a Hiragana puro sin puntuación.
 */
export function toNormalizedHiragana(text: string): string {
  if (!text) return '';
  let result = text.toLowerCase().trim();
  // Si contiene caracteres romaji (a-z), convertir a hiragana
  if (/[a-z]/.test(result)) {
    result = romajiToHiragana(result);
  }
  // Convertir katakana a hiragana
  result = katakanaToHiragana(result);
  // Eliminar signos de puntuación, puntos japoneses y espacios
  return result.replace(/[\s.,!?;:。、！？・]/g, '');
}

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
  const normalized = toNormalizedHiragana(text);
  const candidates = new Set<string>();
  candidates.add(text); // Forma original (con kanji si lo tuviera)
  candidates.add(normalized); // Forma hiragana directa

  // 1. Desconjugación de la forma -te (-て / -で)
  if (normalized.endsWith('て') || normalized.endsWith('で')) {
    // Ichidan (Grupo 2): 食べ(て) -> 食べる
    if (normalized.endsWith('て')) {
      const stem = normalized.slice(0, -1);
      candidates.add(stem + 'る');

      // Irregular: して -> する, きて -> くる
      if (normalized === 'して' || normalized.endsWith('して')) {
        candidates.add(normalized.replace(/して$/, 'する'));
      }
      if (normalized === 'きて' || normalized.endsWith('きて')) {
        candidates.add(normalized.replace(/きて$/, 'くる'));
      }

      // Godan (Grupo 1)
      if (normalized.endsWith('って')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'う');
        candidates.add(base + 'つ');
        candidates.add(base + 'る');
      }
      if (normalized.endsWith('いて')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'く');
        if (normalized === 'いって' || normalized.endsWith('いって')) {
          candidates.add(normalized.replace(/いって$/, 'いく'));
        }
      }
      if (normalized.endsWith('して')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'す');
      }

      // Adjetivos -i: 美味しくて (oishikute) -> 美味しい (oishii)
      if (normalized.endsWith('くて')) {
        candidates.add(normalized.slice(0, -2) + 'い');
      }
    }

    if (normalized.endsWith('で')) {
      if (normalized.endsWith('んで')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'む');
        candidates.add(base + 'ぶ');
        candidates.add(base + 'ぬ');
      }
      if (normalized.endsWith('いで')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'ぐ');
      }
    }
  }

  // 2. Desconjugación de la forma -ta (-た / -だ)
  if (normalized.endsWith('た') || normalized.endsWith('だ')) {
    if (normalized.endsWith('た')) {
      candidates.add(normalized.slice(0, -1) + 'る');
      if (normalized.endsWith('った')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'う');
        candidates.add(base + 'つ');
        candidates.add(base + 'る');
      }
      if (normalized.endsWith('いた')) {
        candidates.add(normalized.slice(0, -2) + 'く');
      }
      if (normalized.endsWith('した')) {
        candidates.add(normalized.slice(0, -2) + 'す');
        candidates.add(normalized.replace(/した$/, 'する'));
      }
      if (normalized.endsWith('かった')) {
        candidates.add(normalized.slice(0, -3) + 'い');
      }
    }
    if (normalized.endsWith('だ')) {
      if (normalized.endsWith('んだ')) {
        const base = normalized.slice(0, -2);
        candidates.add(base + 'む');
        candidates.add(base + 'ぶ');
        candidates.add(base + 'ぬ');
      }
      if (normalized.endsWith('いだ')) {
        candidates.add(normalized.slice(0, -2) + 'ぐ');
      }
    }
  }

  // 3. Desconjugación de la forma cortés -masu (-ます)
  if (normalized.endsWith('ます')) {
    const stem = normalized.slice(0, -2);
    candidates.add(stem + 'る');
    candidates.add(stem + 'す');
    if (normalized === 'します' || normalized.endsWith('します')) {
      candidates.add(normalized.replace(/します$/, 'する'));
    }
    if (normalized === 'きます' || normalized.endsWith('きます')) {
      candidates.add(normalized.replace(/きます$/, 'くる'));
    }
  }

  // 4. Desconjugación de la forma negativa -nai (-ない)
  if (normalized.endsWith('ない')) {
    const stem = normalized.slice(0, -2);
    candidates.add(stem + 'る');
    if (normalized.endsWith('わない')) candidates.add(normalized.slice(0, -3) + 'う');
    if (normalized.endsWith('かない')) candidates.add(normalized.slice(0, -3) + 'く');
    if (normalized.endsWith('さない')) candidates.add(normalized.slice(0, -3) + 'す');
    if (normalized.endsWith('たない')) candidates.add(normalized.slice(0, -3) + 'つ');
    if (normalized.endsWith('なない')) candidates.add(normalized.slice(0, -3) + 'ぬ');
    if (normalized.endsWith('ばない')) candidates.add(normalized.slice(0, -3) + 'ぶ');
    if (normalized.endsWith('まない')) candidates.add(normalized.slice(0, -3) + 'む');
    if (normalized.endsWith('らない')) candidates.add(normalized.slice(0, -3) + 'る');
  }

  return Array.from(candidates);
}
