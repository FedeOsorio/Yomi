import { expandChoonpu, getEffectiveCardLanguage, hiraganaToRomaji, katakanaToHiragana, romajiToHiragana, ZH_NUMBERS } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
import { getPinyinForWord, getReadingsForWord } from './phonetic-dictionary';
import { DIACRITIC_TO_TONE, toSearchKey } from './pinyin-utils';
import { parseAux } from './word-aux';

/**
 * Evaluación de un intento de pronunciación.
 *
 * Regla general: lo que el usuario dijo en UNA elocución se compara COMPLETO contra la
 * lectura esperada de la tarjeta. No se aceptan coincidencias parciales, prefijos, sufijos,
 * conjugaciones ni partículas extra. Solo se tolera:
 *   - escribir la misma palabra con otro sistema (kanji homófono, katakana, romaji, números en cifras:
 *     26日 = 二十六日, 8がつ = 八月),
 *   - vocales largas escritas distinto (おう / おお / ー),
 *   - は/へ/を escritos donde la palabra lleva わ/え/お (el modelo toma el sonido como partícula),
 *   - 1 error de sonido en palabras largas (≥ 8 letras en romaji).
 * Las tolerancias de sonido (duración, っ, 1 sonido distinto) valen solo cuando el reconocedor escribió kana:
 * si escribió kanji ya eligió la palabra, y se compara su lectura exacta.
 */

export interface VoiceMatchResult {
  isMatch: boolean;
  /** Lectura de la tarjeta que coincidió. */
  matchedReading?: string;
  /** Lo que se entendió, en kana/pinyin cuando es posible, para mostrar al usuario. */
  heard?: string;
}

type CardLike = {
  displayText?: string | null;
  displayReading?: string | null;
  auxiliaryInfo?: string | null;
  languageCode?: string | null;
  deckType?: 'language' | 'custom' | null;
};

const PUNCT = /[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()\[\]【】]/g;
const HAS_KANJI = /[㐀-鿿]/;

// ───────────── utilidades ─────────────

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Hiragana a partir de kana/romaji. Devuelve '' si el texto contiene kanji (no se adivina su lectura). */
function toKana(text: string): string {
  let t = (text || '').toLowerCase();
  // El romaji se convierte antes de quitar signos: la ' separa la ん (kan'you = かんよう, kanyou = かにょう)
  if (/[a-z]/.test(t)) t = romajiToHiragana(t);
  t = t.replace(PUNCT, '');
  if (!t || HAS_KANJI.test(t)) return '';
  t = expandChoonpu(katakanaToHiragana(t));
  return t.replace(/[ぁぃぅぇぉ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1)).replace(/[^぀-ゟ]/g, '');
}

/** Unifica la escritura de vocales largas: こう/こお → こう, せい/せえ → せい. */
function phonetic(kana: string): string {
  return kana.replace(/([おこそとのほもよろごぞどぼぽょ])お/g, '$1う').replace(/([えけせてねへめれげぜでべぺ])え/g, '$1い');
}

/** Colapsa vocales largas seguidas al sonido base para tolerar diferencias de duración (ej. とうも ↔ とも, こお ↔ こ). */
function collapseLongVowels(kana: string): string {
  const s = expandChoonpu(kana);
  return s
    .replace(/([おこそとのほもよろごぞどぼぽょ])([うお])/g, '$1')
    .replace(/([えけせてねへめれげぜでべぺ])([いえ])/g, '$1')
    .replace(/([あかさたなはまやらわがざだばぱ])([あ])/g, '$1')
    .replace(/([いきしちにひみりぎじぢびぴ])([い])/g, '$1')
    .replace(/([うくすつぬふむゆるぐずづぶぷ])([う])/g, '$1');
}

function splitReadings(raw?: string | null): string[] {
  return (raw || '')
    .split(/[\/\n,、;•|]/)
    .map((p) => p.replace(/^\s*(on|kun|音|訓)\s*[:：]?/i, '').replace(/[.\-]/g, ''))
    .map(toKana)
    .filter(Boolean);
}

/** Quita HTML y entidades que traen los mazos importados de Anki (<b>白</b>, &nbsp;). */
function stripMarkup(text?: string | null): string {
  return (text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Si la tarjeta es UN SOLO KANJI, todas sus lecturas on/kun del catálogo (el usuario puede decir
 * cualquiera que conozca). Para palabras devuelve [] : solo vale la lectura de esa palabra.
 */
export function singleKanjiReadings(displayText?: string | null): string[] {
  const single = stripMarkup(displayText).replace(/[\[(【（].*?[\])】）]/g, '').replace(PUNCT, '').trim();
  if (single.length === 1 && KANJI_READINGS_MAP[single]) {
    return KANJI_READINGS_MAP[single];
  }
  // Un único kanji acompañado de una glosa o lectura SEPARADA (ej. "白 / しろ", "白: blanco"). Con kana
  // pegado es una palabra (食べる, 行く, 小さい): vale solo su lectura, no cualquiera del kanji
  const head = stripMarkup(displayText).split(/[\/:：=|]|\s/)[0].trim();
  if ([...head].length === 1 && KANJI_READINGS_MAP[head]) {
    return KANJI_READINGS_MAP[head];
  }
  return [];
}

// ───────────── japonés ─────────────

function expectedJapaneseReadings(card: CardLike): string[] {
  const text = (card.displayText || '').trim();
  const set = new Set<string>(splitReadings(card.displayReading));

  // Furigana escrito en la tarjeta: 食べる[たべる]
  for (const m of text.matchAll(/[\[(【（](.*?)[\])】）]/g)) splitReadings(m[1]).forEach((r) => set.add(r));

  // Tarjetas solo en kana: el propio texto es la lectura
  const surface = text.replace(/[\[(【（].*?[\])】）]/g, '');
  const kanaSurface = toKana(surface);
  if (kanaSurface) set.add(kanaSurface);

  const aux = parseAux(card.auxiliaryInfo);
  [aux.kanjiReadings, aux.onReading, aux.kunReading].forEach((r) => splitReadings(r).forEach((x) => set.add(x)));

  // Tarjeta de un único kanji: cualquiera de sus lecturas on/kun
  singleKanjiReadings(text).forEach((r) => set.add(toKana(r)));
  set.delete('');
  return [...set];
}

/**
 * Lo que entendió el reconocedor, en kana.
 * - kana: escribió kana o romaji. Es el sonido tal cual, y admite las tolerancias de duración y っ.
 * - written: escribió kanji. Si es una palabra conocida (los mazos del usuario), sus lecturas; si no, las
 *   combinaciones de lecturas de cada kanji (homófonos: 橋 → はし coincide con 箸). El reconocedor ya decidió
 *   qué palabra era, así que estas se comparan exactas: con tantas combinaciones, cualquier tolerancia
 *   termina aceptando palabras distintas (四日 por 八日, 兄 por 今日).
 */
function heardJapaneseReadings(transcript: string): { kana: string[]; written: string[] } {
  const clean = transcript.replace(PUNCT, '');
  const direct = toKana(clean);
  if (direct) return { kana: [direct], written: [] };

  // Palabra de los mazos del usuario (川 = かわ): se sabe cómo se lee, no se prueban otras lecturas
  const known = getReadingsForWord(clean).map(toKana).filter(Boolean);
  if (known.length > 0) return { kana: [], written: known };

  const out = new Set<string>();
  // Homófonos: combinar lecturas de cada kanji (橋 → はし coincide con 箸). Limitado para no explotar.
  // El modelo a veces repite en kana la última sílaba del kanji (山ま, 山マ = やま): si la lectura
  // ya termina con ese kana, también se prueba sin repetirlo.
  // Solo el patrón "un kanji + un kana repetido" (山ま); no afecta palabras con okurigana real.
  const isKanjiPlusEcho = /^[\u3400-\u9fff][\u3040-\u30ff]$/.test(clean);
  let combos = [''];
  let prevWasKanji = false;
  for (const ch of clean) {
    const isKanji = HAS_KANJI.test(ch);
    const options = isKanji ? (KANJI_READINGS_MAP[ch] || []).map(toKana) : [toKana(ch)];
    if (options.length === 0 || options.every((o) => !o)) {
      combos = [];
      break;
    }
    const next: string[] = [];
    for (const prefix of combos) {
      for (const o of options) {
        if (!o || next.length >= 200) continue;
        next.push(prefix + o);
        if (!isKanji && prevWasKanji && isKanjiPlusEcho && prefix.endsWith(o)) next.push(prefix);
      }
    }
    combos = next;
    prevWasKanji = isKanji;
  }
  combos.forEach((c) => out.add(c));
  out.delete('');
  return { kana: [], written: [...out] };
}

const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** Número escrito en cifras → en kanji, como se escribe en japonés: 26 → 二十六, 1000 → 千, 2024 → 二千二十四. */
function numberToKanji(digits: string): string {
  const n = Number(digits);
  // Con ceros a la izquierda o enorme: dígito por dígito (〇五, como un código)
  if ((digits.length > 1 && digits.startsWith('0')) || !Number.isSafeInteger(n) || n >= 1e16) {
    return [...digits].map((d) => KANJI_DIGITS[Number(d)]).join('');
  }
  if (n === 0) return '零';
  const below10000 = (m: number) => {
    let s = '';
    for (const [value, sign] of [[1000, '千'], [100, '百'], [10, '十']] as const) {
      const q = Math.floor(m / value);
      if (q > 0) s += (q > 1 ? KANJI_DIGITS[q] : '') + sign;
      m %= value;
    }
    return s + (m > 0 ? KANJI_DIGITS[m] : '');
  };
  let s = '';
  let rest = n;
  for (const [value, sign] of [[1e12, '兆'], [1e8, '億'], [1e4, '万']] as const) {
    const q = Math.floor(rest / value);
    if (q > 0) s += below10000(q) + sign;
    rest %= value;
  }
  return s + below10000(rest);
}

/**
 * Misma escritura para los números: el reconocedor los escribe en cifras (26日, 8月, ８がつ) y las tarjetas
 * en kanji (二十六日, 八月). Son la misma palabra. También unifica ヶ/ヵ/カ/箇 después de un número (一ヶ月 = 一か月).
 */
function normalizeNumerals(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/(\d)[,，](?=\d{3})/g, '$1')
    .replace(/\d+/g, numberToKanji)
    .replace(/([〇零一二三四五六七八九十百千万億兆])[ヶヵケカ箇]/g, '$1か');
}

function matchJapanese(card: CardLike, transcript: string): VoiceMatchResult {
  const expected = expectedJapaneseReadings(card);
  const surface = normalizeNumerals((card.displayText || '').replace(/[\[(【（].*?[\])】）]/g, '')).replace(PUNCT, '');
  const clean = normalizeNumerals(transcript).replace(PUNCT, '');

  // 1. Escribió exactamente la palabra de la tarjeta
  if (surface && clean === surface) {
    return { isMatch: true, matchedReading: expected[0] ?? surface, heard: expected[0] ?? surface };
  }

  // 1b. Repetición de la palabra (el usuario dijo la palabra dos veces o el motor la concatenó: ej. かくかく vs かく)
  if (surface && (clean === surface + surface || clean === surface + surface + surface)) {
    return { isMatch: true, matchedReading: expected[0] ?? surface, heard: expected[0] ?? surface };
  }
  for (const e of expected) {
    if (e && (clean === e + e || clean === e + e + e)) {
      return { isMatch: true, matchedReading: e, heard: e };
    }
  }

  const { kana: heardKana, written: heardWritten } = heardJapaneseReadings(clean);
  const heard = [...heardKana, ...heardWritten];
  // 2. Misma lectura (permitiendo vocales largas escritas distinto)
  for (const h of heard) {
    const hit = expected.find((e) => phonetic(e) === phonetic(h));
    if (hit) return { isMatch: true, matchedReading: hit, heard: hit };
  }

  // Desde acá, tolerancias de sonido: solo para lo que el reconocedor escribió en kana (oyó el sonido y
  // pudo errar la duración). Si escribió kanji ya decidió la palabra, y se compara exacto (paso 2).

  // 2-repeat. Misma lectura repetida (ej. 書く書く oído como かくかく vs かく)
  for (const h of heardKana) {
    for (const e of expected) {
      if (e && (h === e + e || h === e + e + e || phonetic(h) === phonetic(e) + phonetic(e))) {
        return { isMatch: true, matchedReading: e, heard: e };
      }
    }
  }

  // 2b. Mismo sonido con tolerancia de duración en vocales largas (ej. とうも vs とも)
  for (const h of heardKana) {
    const hit = expected.find((e) => collapseLongVowels(phonetic(e)) === collapseLongVowels(phonetic(h)));
    if (hit) return { isMatch: true, matchedReading: hit, heard: hit };
  }

  // 2c. Mismo sonido con tolerancia de sokuon (っ) espurio o absorbido ante oclusivas/africadas (ej. くっち vs くち)
  for (const h of heardKana) {
    const hNoSokuon = phonetic(h).replace(/っ/g, '');
    const hit = expected.find((e) => phonetic(e).replace(/っ/g, '') === hNoSokuon);
    if (hit) return { isMatch: true, matchedReading: hit, heard: hit };
  }

  // 2d. Mismo sonido escrito como partícula: el modelo oye "kawa" como か + は (partícula "wa").
  //     Solo vale donde la tarjeta lleva わ/え/お en esa posición; no agrega ni quita sonidos.
  for (const h of heardKana) {
    const hit = expected.find((e) => sameSoundAsParticle(phonetic(h), phonetic(e)));
    if (hit) return { isMatch: true, matchedReading: hit, heard: hit };
  }

  // 3. Palabras largas: se tolera 1 sonido distinto (comparando en romaji)
  for (const h of heardKana) {
    const hr = hiraganaToRomaji(phonetic(h));
    for (const e of expected) {
      const er = hiraganaToRomaji(phonetic(e));
      if (er.length >= 8 && levenshtein(hr, er) <= 1) return { isMatch: true, matchedReading: e, heard: e };
    }
  }

  // 4. Palabras de UNA sola mora (こ, き, て…): el modelo suele oír sonora la consonante sorda
  //    cuando no se aspira (こ → ご), algo muy común en hispanohablantes. Solo en esa dirección:
  //    una tarjeta "ご" NO acepta "こ".
  //    También tolera si al pronunciarla aislada se alargó la vocal (こ → こう/こお, じ → じい), pero solo si
  //    el reconocedor lo escribió en kana: en kanji ya eligió una palabra (酔い = えい no es え alargada).
  for (const h of heard) {
    const fromKana = heardKana.includes(h);
    for (const e of expected) {
      if (isSingleMora(e)) {
        const uh = unvoice(h);
        if (unvoice(e) === e && (uh === e || (fromKana && isProlongedMora(uh, e))) && h !== e) {
          return { isMatch: true, matchedReading: e, heard: e };
        }
        if (fromKana && isProlongedMora(h, e)) {
          return { isMatch: true, matchedReading: e, heard: e };
        }
      }
    }
  }

  // Para mostrar: la lectura solo si no hay ambigüedad; si no, lo que se transcribió tal cual
  return { isMatch: false, heard: heard.length === 1 ? heard[0] : clean };
}

// Kana de partícula → cómo suena (は = wa, へ = e, を = o)
const PARTICLE_SOUND: Record<string, string> = { は: 'わ', へ: 'え', を: 'お' };

/** ¿`heard` es `expected` con alguna わ/え/お escrita como partícula (は/へ/を)? */
function sameSoundAsParticle(heard: string, expected: string): boolean {
  if (heard.length !== expected.length || heard === expected) return false;
  for (let i = 0; i < heard.length; i++) {
    if (heard[i] !== expected[i] && PARTICLE_SOUND[heard[i]] !== expected[i]) return false;
  }
  return true;
}

const VOICED: Record<string, string> = {
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ',
  ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ',
};
const unvoice = (kana: string) => kana.replace(/./g, (c) => VOICED[c] ?? c);
const isSingleMora = (kana: string) => /^[\u3041-\u3096][ゃゅょ]?$/.test(kana);

const MORA_VOWEL: Record<string, string> = {
  あ: 'あ', か: 'あ', さ: 'あ', た: 'あ', な: 'あ', は: 'あ', ま: 'あ', や: 'あ', ら: 'あ', わ: 'あ',
  が: 'あ', ざ: 'あ', だ: 'あ', ば: 'あ', ぱ: 'あ',
  い: 'い', き: 'い', し: 'い', ち: 'い', に: 'い', ひ: 'い', み: 'い', り: 'い',
  ぎ: 'い', じ: 'い', ぢ: 'い', び: 'い', ぴ: 'い',
  う: 'う', く: 'う', す: 'う', つ: 'う', ぬ: 'う', ふ: 'う', む: 'う', ゆ: 'う', る: 'う',
  ぐ: 'う', ず: 'う', づ: 'う', ぶ: 'う', ぷ: 'う',
  え: 'え', け: 'え', せ: 'え', て: 'え', ね: 'え', へ: 'え', め: 'え', れ: 'え',
  げ: 'え', ぜ: 'え', で: 'え', べ: 'え', ぺ: 'え',
  お: 'お', こ: 'お', そ: 'お', と: 'お', の: 'お', ほ: 'お', も: 'お', よ: 'お', ろ: 'お',
  ご: 'お', ぞ: 'お', ど: 'お', ぼ: 'お', ぽ: 'お',
};

function isProlongedMora(heard: string, expected: string): boolean {
  if (!isSingleMora(expected)) return false;
  const baseKana = expected.slice(-1);
  const v = MORA_VOWEL[baseKana];
  if (!v) return false;
  if (v === 'お' && (heard === expected + 'う' || heard === expected + 'お')) return true;
  if (v === 'え' && (heard === expected + 'い' || heard === expected + 'え')) return true;
  return heard === expected + v;
}

// ───────────── chino ─────────────

const toneless = (s: string) => toSearchKey(s || '').replace(/[^a-z]/g, '');

/** Número en cifras → en hanzi, como se escribe en chino: 26 → 二十六, 105 → 一百零五, 2024 → 二千零二十四. */
function numberToHanzi(digits: string): string {
  const n = Number(digits);
  if ((digits.length > 1 && digits.startsWith('0')) || !Number.isSafeInteger(n) || n >= 1e12) {
    return [...digits].map((d) => KANJI_DIGITS[Number(d)].replace('〇', '零')).join('');
  }
  if (n === 0) return '零';
  const below10000 = (m: number, leading: boolean) => {
    let s = '';
    let pendingZero = false;
    for (const [value, sign] of [[1000, '千'], [100, '百'], [10, '十'], [1, '']] as const) {
      const q = Math.floor(m / value);
      m %= value;
      if (q === 0) {
        if (s) pendingZero = true;
        continue;
      }
      if (pendingZero) s += '零';
      pendingZero = false;
      // 10-19 al principio se dice 十X, no 一十X
      s += (value === 10 && q === 1 && !s && leading ? '' : KANJI_DIGITS[q]) + sign;
    }
    return s;
  };
  let s = '';
  let rest = n;
  for (const [value, sign] of [[1e8, '亿'], [1e4, '万']] as const) {
    const q = Math.floor(rest / value);
    if (q > 0) s += below10000(q, !s) + sign;
    rest %= value;
  }
  if (rest > 0) s += (s && rest < 1000 ? '零' : '') + below10000(rest, !s);
  return s;
}

function matchChinese(card: CardLike, transcript: string): VoiceMatchResult {
  // Mismo número escrito en cifras o en hanzi (26号 = 二十六号)
  const toHanzi = (t: string) =>
    t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/(\d)[,，](?=\d{3})/g, '$1').replace(/\d+/g, numberToHanzi);
  const hanzi = toHanzi(card.displayText || '').replace(PUNCT, '');
  const reading = card.displayReading || '';
  const clean = toHanzi(transcript).replace(PUNCT, '');

  if (hanzi && clean === hanzi) return { isMatch: true, matchedReading: reading, heard: hanzi };
  const num = ZH_NUMBERS[transcript.replace(PUNCT, '')];
  if (num && (num.hanzi === hanzi || toneless(num.pinyin) === toneless(reading))) {
    return { isMatch: true, matchedReading: reading, heard: num.hanzi };
  }
  // Si el reconocedor devolvió pinyin/latín, comparar sin tonos
  if (/^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+$/.test(transcript) && toneless(transcript) === toneless(reading)) {
    return { isMatch: true, matchedReading: reading, heard: transcript };
  }
  // Hanzi homófono: mismo pinyin con el mismo tono (是 shì no vale por 十 shí). La lectura de lo que escribió
  // el reconocedor sale del diccionario (CC-CEDICT)
  const cardReadings = reading.split(/[\/,;|]/).filter((r) => toneless(r));
  if (chinesePinyinOf(clean).some((p) => cardReadings.some((r) => samePinyin(p, r)))) {
    return { isMatch: true, matchedReading: reading, heard: clean };
  }
  return { isMatch: false, heard: clean };
}

/**
 * Pinyin (tonos en números) de lo que escribió el reconocedor: el de la palabra en el diccionario; si no es una
 * palabra del diccionario, las combinaciones de las lecturas de cada hanzi (limitadas).
 */
function chinesePinyinOf(hanzi: string): string[] {
  const known = getPinyinForWord(hanzi);
  if (known.length > 0 || [...hanzi].length < 2) return known;
  let combos = [''];
  for (const ch of hanzi) {
    const options = getPinyinForWord(ch);
    if (options.length === 0) return [];
    combos = combos.flatMap((prefix) => options.map((o) => `${prefix} ${o}`)).slice(0, 200);
  }
  return combos.map((c) => c.trim());
}

/**
 * Tonos de un pinyin, en orden: "ni3 hao3" → "33", "nǐ hǎo" → "33". El neutro (5, o sílaba sin tilde) no se
 * anota, así ambas escrituras coinciden ("ma1 ma5" = "māma" → "1"). null si no trae tonos de ningún tipo.
 */
function pinyinTones(pinyin: string): string | null {
  const digits = pinyin.match(/[1-5]/g);
  if (digits) return digits.filter((d) => d !== '5').join('');
  const marks = [...pinyin.normalize('NFC')].map((c) => DIACRITIC_TO_TONE[c]?.tone ?? '').join('');
  return marks || null;
}

/** Mismo pinyin: mismas letras y mismos tonos (si uno de los dos no trae tonos, solo las letras). */
function samePinyin(a: string, b: string): boolean {
  if (toneless(a) !== toneless(b)) return false;
  const ta = pinyinTones(a);
  const tb = pinyinTones(b);
  return ta === null || tb === null || ta === tb;
}

// ───────────── otros idiomas ─────────────

const plain = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function matchAlphabetic(card: CardLike, transcript: string): VoiceMatchResult {
  const expected = plain(card.displayText || '');
  const heard = plain(transcript);
  const ok = Boolean(expected) && (heard === expected || (expected.length >= 8 && levenshtein(heard, expected) <= 1));
  return { isMatch: ok, matchedReading: ok ? card.displayText || '' : undefined, heard: transcript.trim() };
}

/**
 * Palabras que se espera oír para la tarjeta: su escritura y la lectura que muestra la tarjeta.
 * Se usan como pistas del reconocedor; la evaluación la sigue haciendo checkVoiceMatch.
 * NO incluye el catálogo de lecturas on/kun de los kanji sueltos: son muchos fragmentos cortos
 * (のぼ, くだ, きょう…) que, como pistas, hacían que el modelo intercalara kanas de más.
 */
export function expectedVoiceWords(rawCard: CardLike, lang: string): string[] {
  const card = { ...rawCard, displayText: stripMarkup(rawCard.displayText), displayReading: stripMarkup(rawCard.displayReading) };
  const target = getEffectiveCardLanguage({ ...card, languageCode: card.languageCode || lang }).toLowerCase();
  const surface = (card.displayText || '').replace(/[\[(【（].*?[\])】）]/g, '').replace(PUNCT, '');
  if (target.startsWith('ja')) {
    const furigana = [...(card.displayText || '').matchAll(/[\[(【（](.*?)[\])】）]/g)].flatMap((m) => splitReadings(m[1]));
    return Array.from(new Set([surface, ...splitReadings(card.displayReading), ...furigana].filter(Boolean)));
  }
  return Array.from(new Set([surface, ...(card.displayReading || '').split(/[\/\n,、;•|]/).map((r) => r.trim())].filter(Boolean)));
}

/** Compara UNA elocución completa con la tarjeta. */
export function checkVoiceMatch(rawCard: CardLike, transcript: string, lang: string): VoiceMatchResult {
  if (!transcript || !transcript.trim()) return { isMatch: false };
  const card = { ...rawCard, displayText: stripMarkup(rawCard.displayText), displayReading: stripMarkup(rawCard.displayReading) };
  const target = getEffectiveCardLanguage({ ...card, languageCode: card.languageCode || lang }).toLowerCase();
  if (target.startsWith('ja')) return matchJapanese(card, transcript);
  if (target.startsWith('zh')) return matchChinese(card, transcript);
  return matchAlphabetic(card, transcript);
}

/**
 * Respuesta de la práctica de conjugaciones (dicha o escrita) contra la forma esperada (`written`: con kanji,
 * `readings`: en kana). Más estricta que checkVoiceMatch: en una forma conjugada un sonido de más o de menos es
 * otra palabra (いて ≠ いって, きて ≠ きいて, よんで ≠ よでん), así que no se tolera la duración de las vocales, la っ
 * ni un sonido distinto. Solo escrituras equivalentes: la misma escritura, kanji homófono, katakana, romaji, cifras,
 * おう/おお, ぢ/づ = じ/ず, y は/へ/を escritos donde la palabra lleva わ/え/お.
 */
export function matchesConjugationAnswer(expected: { written: string[]; readings: string[] }, transcript: string): boolean {
  const raw = /[a-z]/i.test(transcript || '') ? romajiToHiragana(transcript) : transcript || '';
  const clean = normalizeNumerals(raw).replace(PUNCT, '');
  if (!clean) return false;
  if (expected.written.some((w) => w && normalizeNumerals(w).replace(PUNCT, '') === clean)) return true;
  // ぢ/づ suenan igual que じ/ず (つづける se dice "tsuzukeru"): es la misma escritura
  const sound = (kana: string) => phonetic(kana).replace(/ぢ/g, 'じ').replace(/づ/g, 'ず');
  const targets = expected.readings.map(toKana).filter(Boolean).map(sound);
  const { kana, written } = heardJapaneseReadings(clean);
  if (written.some((h) => targets.includes(sound(h)))) return true;
  return kana.some((h) => targets.some((e) => e === sound(h) || sameSoundAsParticle(sound(h), e)));
}
