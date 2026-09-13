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

const KANJI_READINGS_MAP: Record<string, string> = {
  // Yomu / Yobu / Yonde
  '呼': 'よ', '読': 'よ', '詠': 'よ', '四': 'よん', '４': 'よん', '4': 'よん',
  // Kaku
  '書': 'か', '描': 'か', '掻': 'か',
  // Iku
  '行': 'い', '逝': 'い',
  // Miru
  '見': 'み', '観': 'み', '診': 'み',
  // Kiku
  '聞': 'き', '訊': 'き', '聴': 'き',
  // Au
  '会': 'あ', '合': 'あ', '逢': 'あ',
  // Iu
  '言': 'い',
  // Tatsu
  '立': 'た', '発': 'た', '断': 'た',
  // Naosu
  '直': 'なお', '治': 'なお',
  // Hanasu
  '話': 'はな', '離': 'はな', '放': 'はな',
  // Toru
  '取': 'と', '撮': 'と', '採': 'と', '捕': 'と',
  // Kuru / Kiru
  '来': 'き', '着': 'き', '切': 'き',
  // Uru / Utsu
  '売': 'う', '打': 'う',
  // Nomu
  '飲': 'の', '呑': 'の',
  // Asob
  '遊': 'あそ',
  // Shin
  '死': 'し',
  // Oyog
  '泳': 'およ',
  // Isog
  '急': 'いそ',
  // Hatarak
  '働': 'はたら',
  // Aruk
  '歩': 'ある',
  // Hashir
  '走': 'はし',
  // Suwar
  '座': 'すわ',
  // Tsukau
  '使': 'つか',
  // Tsukuru
  '作': 'つく', '造': 'つく', '創': 'つく',
  // Shiru
  '知': 'し',
  // Motsu
  '持': 'も',
  // Hajimaru
  '始': 'はじ',
  // Owaru
  '終': 'おわ',
  // Ochiru
  '落': 'お',
  // Okiru
  '起': 'お',
  // Akeru
  '開': 'あ',
  // Shimeru
  '閉': 'し',
  // Oshieru
  '教': 'おし',
  // Wasureru
  '忘': 'わす',
  // Oboeru
  '覚': 'おぼ',
  // Tsukare
  '疲': 'つか',
  // Neru
  '寝': 'ね',
  // Taberu
  '食': 'た',
  // Mochi
  '待': 'ま',
  // Daijoubu
  '大丈夫': 'だいじょうぶ',
  // Genki
  '元気': 'げんき',
  // Shizuka
  '静': 'しず',
  // Kirei
  '綺麗': 'きれい', '奇麗': 'きれい',
  // Oishii
  '美味': 'おい',
  // Takai
  '高': 'たか',
  // Yasui
  '安': 'やす',
  // Hayai
  '早': 'はや', '速': 'はや',
  // Yoi / Ii
  '良': 'よ',
  // Sumu / Sunde
  '住': 'す',
};

/**
 * Convierte caracteres Kanji habituales en práctica y homófonos de reconocimiento por voz a su lectura Kana.
 */
export function kanjiToHiragana(text: string): string {
  if (!text) return '';
  let res = text.trim();
  // Primero reemplazar palabras multi-kanji conocidas
  for (const [k, r] of Object.entries(KANJI_READINGS_MAP)) {
    if (k.length > 1 && res.includes(k)) {
      res = res.split(k).join(r);
    }
  }
  // Luego caracteres individuales
  for (const [k, r] of Object.entries(KANJI_READINGS_MAP)) {
    if (k.length === 1 && res.includes(k)) {
      res = res.split(k).join(r);
    }
  }
  return res;
}

/**
 * Normaliza cualquier texto en japonés (Romaji, Katakana, Hiragana o Kanji fonético) a Hiragana puro sin puntuación ni espacios.
 */
export function toNormalizedHiragana(text: string): string {
  if (!text) return '';
  let result = text.toLowerCase().trim();
  // Si contiene kanji conocidos o números de transcripción de voz, resolver fonéticamente
  result = kanjiToHiragana(result);
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
    
    if (stem.length > 0) {
      const lastChar = stem[stem.length - 1];
      const base = stem.slice(0, -1);
      if (lastChar === 'い') candidates.add(base + 'う');
      if (lastChar === 'ち') candidates.add(base + 'つ');
      if (lastChar === 'り') candidates.add(base + 'る');
      if (lastChar === 'き') candidates.add(base + 'く');
      if (lastChar === 'ぎ') candidates.add(base + 'ぐ');
      if (lastChar === 'し') candidates.add(base + 'す');
      if (lastChar === 'み') candidates.add(base + 'む');
      if (lastChar === 'び') candidates.add(base + 'ぶ');
      if (lastChar === 'に') candidates.add(base + 'ぬ');
    }

    if (normalized === 'します' || normalized.endsWith('します')) {
      candidates.add(normalized.replace(/します$/, 'する'));
    }
    if (normalized === 'きます' || normalized.endsWith('きます')) {
      candidates.add(normalized.replace(/きます$/, 'くる'));
    }

    if (text.endsWith('ます')) {
      const kStem = text.slice(0, -2);
      candidates.add(kStem + 'る');
      if (kStem.length > 0) {
        const kLastChar = kStem[kStem.length - 1];
        const kBase = kStem.slice(0, -1);
        if (kLastChar === 'い') candidates.add(kBase + 'う');
        if (kLastChar === 'ち') candidates.add(kBase + 'つ');
        if (kLastChar === 'り') candidates.add(kBase + 'る');
        if (kLastChar === 'き') candidates.add(kBase + 'く');
        if (kLastChar === 'ぎ') candidates.add(kBase + 'ぐ');
        if (kLastChar === 'し') candidates.add(kBase + 'す');
        if (kLastChar === 'み') candidates.add(kBase + 'む');
        if (kLastChar === 'び') candidates.add(kBase + 'ぶ');
        if (kLastChar === 'に') candidates.add(kBase + 'ぬ');
      }
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

  // 5. Desconjugación de la forma progresiva / estado (-te imasu / -te iru / -te ita / -te imashita)
  // Ejemplos: 住んでいます (sundeimasu) -> 住む (sumu), 食べています -> 食べる, 知っています -> 知る
  if (/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/.test(normalized)) {
    const teForm = normalized.replace(/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/, (m) => m.startsWith('で') ? 'で' : 'て');
    for (const c of deconjugateJapanese(teForm)) {
      candidates.add(c);
    }
    if (/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/.test(text)) {
      const kTeForm = text.replace(/(ています|でいます|ている|でいる|ていた|でいた|ていました|でいました)$/, (m) => m.startsWith('で') ? 'で' : 'て');
      for (const c of deconjugateJapanese(kTeForm)) {
        candidates.add(c);
      }
    }
  }

  // 6. Desconjugación de formas corteses derivadas (-mashita, -masen, -masendeshita, -mashou, -tai, -takunai)
  // Ejemplos: 食べました -> 食べる, 飲みません -> 飲む, 行きましょう -> 行く
  if (/(ました|ませんでした|ません|ましょう|たい|たくない)$/.test(normalized)) {
    const masuForm = normalized.replace(/(ました|ませんでした|ません|ましょう|たい|たくない)$/, 'ます');
    for (const c of deconjugateJapanese(masuForm)) {
      candidates.add(c);
    }
    if (/(ました|ませんでした|ません|ましょう|たい|たくない)$/.test(text)) {
      const kMasuForm = text.replace(/(ました|ませんでした|ません|ましょう|たい|たくない)$/, 'ます');
      for (const c of deconjugateJapanese(kMasuForm)) {
        candidates.add(c);
      }
    }
  }

  // 7. Desconjugación de formas negativas derivadas (-nakatta, -nakute, -naide)
  // Ejemplos: 食べなかった -> 食べる, 食べなくて / 食べないで -> 食べる
  if (/(なかった|なくて|ないで)$/.test(normalized)) {
    const naiForm = normalized.replace(/(なかった|なくて|ないで)$/, 'ない');
    for (const c of deconjugateJapanese(naiForm)) {
      candidates.add(c);
    }
    if (/(なかった|なくて|ないで)$/.test(text)) {
      const kNaiForm = text.replace(/(なかった|なくて|ないで)$/, 'ない');
      for (const c of deconjugateJapanese(kNaiForm)) {
        candidates.add(c);
      }
    }
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

  // Verbos Irregulares (hacer / venir)
  if (normalized === 'する' || normalized.endsWith('する')) {
    return 'Verbo Irregular';
  }
  if (normalized === 'くる' || normalized.endsWith('くる') || word === '来る') {
    return 'Verbo Irregular';
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
      return 'Verbo Ichidan (-ru)';
    }
    return 'Verbo Godan (-ru)';
  }

  // Adjetivos -na comunes o terminados en な
  const knownNaAdj = [
    'だいじょうぶ', 'ゆうめい', 'べんり', 'げんき', 'しずか', 'ひま', 'しんせつ',
    'かんたん', 'すき', 'きらい', 'きれい', 'あんぜん', 'じょうず', 'へた',
    'たいせつ', 'とくべつ', 'ひつよう', 'じゆう', 'ざんねん', 'すてき',
    'たいへん', 'さまざま', 'ふくざつ', 'まじめ', 'にぎやか', 'ふべん'
  ];
  if (knownNaAdj.includes(normalized) || knownNaAdj.some(na => clean.startsWith(na))) {
    return 'Adjetivo -na';
  }

  // Verbos Godan (terminados en う, く, ぐ, す, つ, ぬ, ぶ, む)
  if (/[うくぐすつぬぶむ]/.test(normalized[normalized.length - 1])) {
    return 'Verbo Godan (-u)';
  }

  // Adjetivos -na
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
  const hira = toNormalizedHiragana(reading || cleanWord);

  if (!hira) return false;

  // Frases o expresiones no son formas de diccionario conjugables
  if (category.includes('Frase') || cleanWord.includes(' ') || hira.length >= 7) {
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

  // 3. Si es Verbo Ichidan: debe terminar en る
  if (category.includes('Ichidan')) {
    return hira.endsWith('る');
  }

  // 4. Si es Verbo Godan: debe terminar en u (う, く, ぐ, す, つ, ぬ, ぶ, む, る)
  if (category.includes('Godan')) {
    return /[うくぐすつぬぶむる]$/.test(hira);
  }

  // 5. Si es Adjetivo -i: debe terminar en い
  if (category.includes('Adjetivo -i')) {
    return hira.endsWith('い');
  }

  // 6. Si es Adjetivo -na:
  if (category.includes('Adjetivo -na')) {
    return !hira.endsWith('だった') && !hira.endsWith('じゃない') && !hira.endsWith('でした');
  }

  // Si no tiene categoría explícita pero termina en terminación verbal de diccionario
  if (category.startsWith('Verbo')) {
    return /[うくぐすつぬぶむる]$/.test(hira);
  }

  if (category.startsWith('Adjetivo')) {
    return hira.endsWith('い') || !hira.endsWith('じゃない');
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


