import { expandChoonpu, katakanaToHiragana, romajiToHiragana } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
import { getReadingsForWord } from './phonetic-dictionary';

/**
 * Evaluación de respuestas escritas en japonés:
 * - singleKanjiReadings: las lecturas on/kun de una tarjeta de un solo kanji (en el repaso vale cualquiera).
 * - matchesConjugationAnswer: la respuesta de la práctica de conjugaciones contra la forma esperada.
 */

const PUNCT = /[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()\[\]【】]/g;
const HAS_KANJI = /[㐀-鿿]/;

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
 * Si la tarjeta es UN SOLO KANJI, todas sus lecturas on/kun del catálogo (el usuario puede escribir
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

/**
 * La respuesta, en kana.
 * - kana: se escribió en kana o romaji: el sonido tal cual.
 * - written: se escribió con kanji. Si es una palabra conocida (los mazos del usuario y el diccionario), sus
 *   lecturas; si no, las combinaciones de lecturas de cada kanji (homófonos: 橋 → はし coincide con 箸).
 */
function answerReadings(answer: string): { kana: string[]; written: string[] } {
  const clean = answer.replace(PUNCT, '');
  const direct = toKana(clean);
  if (direct) return { kana: [direct], written: [] };

  // Palabra conocida (川 = かわ): se sabe cómo se lee, no se prueban otras lecturas
  const known = getReadingsForWord(clean).map(toKana).filter(Boolean);
  if (known.length > 0) return { kana: [], written: known };

  // Homófonos: combinar lecturas de cada kanji. Limitado para no explotar.
  let combos = [''];
  for (const ch of clean) {
    const options = HAS_KANJI.test(ch) ? (KANJI_READINGS_MAP[ch] || []).map(toKana) : [toKana(ch)];
    if (options.length === 0 || options.every((o) => !o)) return { kana: [], written: [] };
    const next: string[] = [];
    for (const prefix of combos) {
      for (const o of options) if (o && next.length < 200) next.push(prefix + o);
    }
    combos = next;
  }
  return { kana: [], written: combos.filter(Boolean) };
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
 * Misma escritura para los números: 26日 = 二十六日, 8月 = 八月, ８がつ = 八がつ. También unifica ヶ/ヵ/カ/箇
 * después de un número (一ヶ月 = 一か月).
 */
function normalizeNumerals(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/(\d)[,，](?=\d{3})/g, '$1')
    .replace(/\d+/g, numberToKanji)
    .replace(/([〇零一二三四五六七八九十百千万億兆])[ヶヵケカ箇]/g, '$1か');
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

/**
 * Respuesta de la práctica de conjugaciones contra la forma esperada (`written`: con kanji, `readings`: en kana).
 * En una forma conjugada un sonido de más o de menos es otra palabra (いて ≠ いって, きて ≠ きいて, よんで ≠ よでん),
 * así que no se tolera la duración de las vocales, la っ ni un sonido distinto. Solo escrituras equivalentes:
 * la misma escritura, kanji homófono, katakana, romaji, cifras, おう/おお, ぢ/づ = じ/ず, y は/へ/を escritos donde
 * la palabra lleva わ/え/お.
 */
export function matchesConjugationAnswer(expected: { written: string[]; readings: string[] }, answer: string): boolean {
  const raw = /[a-z]/i.test(answer || '') ? romajiToHiragana(answer) : answer || '';
  const clean = normalizeNumerals(raw).replace(PUNCT, '');
  if (!clean) return false;
  if (expected.written.some((w) => w && normalizeNumerals(w).replace(PUNCT, '') === clean)) return true;
  // ぢ/づ suenan igual que じ/ず (つづける se dice "tsuzukeru"): es la misma escritura
  const sound = (kana: string) => phonetic(kana).replace(/ぢ/g, 'じ').replace(/づ/g, 'ず');
  const targets = expected.readings.map(toKana).filter(Boolean).map(sound);
  const { kana, written } = answerReadings(clean);
  if (written.some((h) => targets.includes(sound(h)))) return true;
  return kana.some((h) => targets.some((e) => e === sound(h) || sameSoundAsParticle(sound(h), e)));
}
