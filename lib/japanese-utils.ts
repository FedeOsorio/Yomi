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

/**
 * Clasifica heurísticamente una palabra japonesa en su categoría gramatical (Part of Speech).
 */
export function classifyJapaneseWord(word: string, reading?: string): string {
  if (!word) return 'Sustantivo';
  const clean = (reading || word).trim();
  const normalized = toNormalizedHiragana(clean);

  if (normalized.length === 0) return 'Sustantivo';

  // Frase u oración larga
  if (word.includes(' ') || normalized.length >= 7) {
    return 'Frase / Expresión';
  }

  // Verbos Irregulares (Grupo 3: する / くる)
  if (normalized === 'する' || normalized.endsWith('する')) {
    return 'Verbo Irregular (Grupo 3)';
  }
  if (normalized === 'くる' || normalized.endsWith('くる') || word === '来る') {
    return 'Verbo Irregular (Grupo 3)';
  }

  // Adjetivos -i (terminan en い precedido de vocal y no son excepciones sustantivas conocidas)
  if (normalized.length >= 2 && normalized.endsWith('い')) {
    const prevChar = normalized[normalized.length - 2];
    // Excepciones conocidas sustantivos: 綺麗 (kirei -> na), 嫌い (kirai -> na)
    if (word === '綺麗' || normalized === 'きれい') return 'Adjetivo -na';
    if (word === '嫌い' || normalized === 'きらい') return 'Adjetivo -na';
    if (['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'ら', 'り', 'る', 'れ', 'ろ', 'わ'].includes(prevChar)) {
      return 'Adjetivo -i';
    }
  }

  // Verbos Ichidan (terminados en る precedido de sonido i o e)
  if (normalized.endsWith('る') && normalized.length >= 2) {
    const prevChar = normalized[normalized.length - 2];
    const ichidanPrevs = [
      'い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ',
      'え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'
    ];
    // Excepciones conocidas Godan que terminan en iru/eru: 帰る (kaeru), 知る (shiru), 切る (kiru), 入る (hairu), 走る (hashiru)
    const godanExceptions = ['かえる', 'しる', 'きる', 'はいる', 'はしる', 'へる', 'しゃべる', 'すべる'];
    if (ichidanPrevs.includes(prevChar) && !godanExceptions.includes(normalized)) {
      return 'Verbo Ichidan (Grupo 2)';
    }
    return 'Verbo Godan (Grupo 1)';
  }

  // Verbos Godan (Grupo 1: terminados en う, く, ぐ, す, つ, ぬ, ぶ, む)
  if (/[うくぐすつぬぶむ]/.test(normalized[normalized.length - 1])) {
    return 'Verbo Godan (Grupo 1)';
  }

  // Adjetivos -na
  if (normalized.endsWith('な') && normalized.length > 2) {
    return 'Adjetivo -na';
  }

  return 'Sustantivo';
}

export type JapaneseConjugationForm = 'te' | 'ta' | 'nai' | 'masu';

/**
 * Conjuga un verbo o adjetivo japonés a la forma deseada (-te, -ta, -nai, -masu).
 * Devuelve tanto el texto con Kanji como la lectura en Hiragana.
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

  const isIrregular = category.includes('Irregular') || cleanWord.endsWith('する') || cleanWord.endsWith('くる') || cleanWord === '来る';
  const isIchidan = category.includes('Ichidan');
  const isGodan = category.includes('Godan') || (!isIrregular && !isIchidan && /[うくぐすつぬぶむる]$/.test(hira));
  const isAdjI = category.includes('Adjetivo -i') || (!category.includes('Verbo') && hira.endsWith('い'));
  const isAdjNa = category.includes('Adjetivo -na');

  // 1. Verbos Irregulares: する y くる
  if (isIrregular) {
    if (hira === 'する' || hira.endsWith('する')) {
      const kStem = cleanWord.endsWith('する') ? cleanWord.slice(0, -2) : '';
      const rStem = hira.slice(0, -2);
      if (form === 'te') return { kanji: `${kStem}して`, reading: `${rStem}して` };
      if (form === 'ta') return { kanji: `${kStem}した`, reading: `${rStem}した` };
      if (form === 'nai') return { kanji: `${kStem}しない`, reading: `${rStem}しない` };
      if (form === 'masu') return { kanji: `${kStem}します`, reading: `${rStem}します` };
    }
    if (hira === 'くる' || hira.endsWith('くる') || cleanWord.endsWith('来る')) {
      if (form === 'te') return { kanji: '来て', reading: 'きて' };
      if (form === 'ta') return { kanji: '来た', reading: 'きた' };
      if (form === 'nai') return { kanji: '来ない', reading: 'こない' };
      if (form === 'masu') return { kanji: '来ます', reading: 'きます' };
    }
  }

  // 2. Verbos Ichidan (quitar る)
  if (isIchidan && hira.endsWith('る')) {
    const kStem = cleanWord.endsWith('る') ? cleanWord.slice(0, -1) : cleanWord;
    const rStem = hira.slice(0, -1);
    if (form === 'te') return { kanji: `${kStem}て`, reading: `${rStem}て` };
    if (form === 'ta') return { kanji: `${kStem}た`, reading: `${rStem}た` };
    if (form === 'nai') return { kanji: `${kStem}ない`, reading: `${rStem}ない` };
    if (form === 'masu') return { kanji: `${kStem}ます`, reading: `${rStem}ます` };
  }

  // 3. Verbos Godan
  if (isGodan) {
    const lastChar = hira[hira.length - 1];
    const kStem = cleanWord.length > 0 ? cleanWord.slice(0, -1) : '';
    const rStem = hira.slice(0, -1);

    // Caso especial: 行く (iku)
    if (cleanWord === '行く' || hira === 'いく') {
      if (form === 'te') return { kanji: '行って', reading: 'いって' };
      if (form === 'ta') return { kanji: '行った', reading: 'いった' };
      if (form === 'nai') return { kanji: '行かない', reading: 'いかない' };
      if (form === 'masu') return { kanji: '行きます', reading: 'いきます' };
    }

    if (lastChar === 'う') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}わない`, reading: `${rStem}わない` };
      if (form === 'masu') return { kanji: `${kStem}います`, reading: `${rStem}います` };
    }
    if (lastChar === 'つ') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}たない`, reading: `${rStem}たない` };
      if (form === 'masu') return { kanji: `${kStem}ちます`, reading: `${rStem}ちます` };
    }
    if (lastChar === 'る') {
      if (form === 'te') return { kanji: `${kStem}って`, reading: `${rStem}って` };
      if (form === 'ta') return { kanji: `${kStem}った`, reading: `${rStem}った` };
      if (form === 'nai') return { kanji: `${kStem}らない`, reading: `${rStem}らない` };
      if (form === 'masu') return { kanji: `${kStem}ります`, reading: `${rStem}ります` };
    }
    if (lastChar === 'く') {
      if (form === 'te') return { kanji: `${kStem}いて`, reading: `${rStem}いて` };
      if (form === 'ta') return { kanji: `${kStem}いた`, reading: `${rStem}いた` };
      if (form === 'nai') return { kanji: `${kStem}かない`, reading: `${rStem}かない` };
      if (form === 'masu') return { kanji: `${kStem}きます`, reading: `${rStem}きます` };
    }
    if (lastChar === 'ぐ') {
      if (form === 'te') return { kanji: `${kStem}いで`, reading: `${rStem}いで` };
      if (form === 'ta') return { kanji: `${kStem}いだ`, reading: `${rStem}いだ` };
      if (form === 'nai') return { kanji: `${kStem}がない`, reading: `${rStem}がない` };
      if (form === 'masu') return { kanji: `${kStem}ぎます`, reading: `${rStem}ぎます` };
    }
    if (lastChar === 'す') {
      if (form === 'te') return { kanji: `${kStem}して`, reading: `${rStem}して` };
      if (form === 'ta') return { kanji: `${kStem}した`, reading: `${rStem}した` };
      if (form === 'nai') return { kanji: `${kStem}さない`, reading: `${rStem}さない` };
      if (form === 'masu') return { kanji: `${kStem}します`, reading: `${rStem}します` };
    }
    if (lastChar === 'む' || lastChar === 'ぶ' || lastChar === 'ぬ') {
      const naiSuffix = lastChar === 'む' ? 'まない' : lastChar === 'ぶ' ? 'ばない' : 'なない';
      const masuSuffix = lastChar === 'む' ? 'みます' : lastChar === 'ぶ' ? 'びます' : 'にます';
      if (form === 'te') return { kanji: `${kStem}んで`, reading: `${rStem}んで` };
      if (form === 'ta') return { kanji: `${kStem}んだ`, reading: `${rStem}んだ` };
      if (form === 'nai') return { kanji: `${kStem}${naiSuffix}`, reading: `${rStem}${naiSuffix}` };
      if (form === 'masu') return { kanji: `${kStem}${masuSuffix}`, reading: `${rStem}${masuSuffix}` };
    }
  }

  // 4. Adjetivos -i
  if (isAdjI && hira.endsWith('い')) {
    const kStem = cleanWord.endsWith('い') ? cleanWord.slice(0, -1) : cleanWord;
    const rStem = hira.slice(0, -1);
    if (form === 'te') return { kanji: `${kStem}くて`, reading: `${rStem}くて` };
    if (form === 'ta') return { kanji: `${kStem}かった`, reading: `${rStem}かった` };
    if (form === 'nai') return { kanji: `${kStem}くない`, reading: `${rStem}くない` };
    if (form === 'masu') return { kanji: `${kStem}いです`, reading: `${rStem}いです` };
  }

  // 5. Adjetivos -na
  if (isAdjNa) {
    const baseK = cleanWord.endsWith('な') ? cleanWord.slice(0, -1) : cleanWord;
    const baseR = hira.endsWith('な') ? hira.slice(0, -1) : hira;
    if (form === 'te') return { kanji: `${baseK}で`, reading: `${baseR}で` };
    if (form === 'ta') return { kanji: `${baseK}だった`, reading: `${baseR}だった` };
    if (form === 'nai') return { kanji: `${baseK}じゃない`, reading: `${baseR}じゃない` };
    if (form === 'masu') return { kanji: `${baseK}です`, reading: `${baseR}です` };
  }

  // Fallback seguro
  return { kanji: cleanWord, reading: cleanReading };
}

