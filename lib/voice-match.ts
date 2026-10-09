import { expandChoonpu, getEffectiveCardLanguage, hiraganaToRomaji, JA_NUMBERS, katakanaToHiragana, romajiToHiragana, ZH_NUMBERS } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
import { getReadingsForWord } from './phonetic-dictionary';
import { toSearchKey } from './pinyin-utils';
import { parseAux } from './word-aux';

/**
 * Evaluación de un intento de pronunciación.
 *
 * Regla general: lo que el usuario dijo en UNA elocución se compara COMPLETO contra la
 * lectura esperada de la tarjeta. No se aceptan coincidencias parciales, prefijos, sufijos,
 * conjugaciones ni partículas extra. Solo se tolera:
 *   - escribir la misma lectura con otro sistema (kanji homófono, katakana, romaji),
 *   - vocales largas escritas distinto (おう / おお / ー),
 *   - 1 error de sonido en palabras largas (≥ 8 letras en romaji).
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
  let t = (text || '').toLowerCase().replace(PUNCT, '');
  if (!t || HAS_KANJI.test(t)) return '';
  if (/[a-z]/.test(t)) t = romajiToHiragana(t);
  t = expandChoonpu(katakanaToHiragana(t));
  return t.replace(/[ぁぃぅぇぉ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1)).replace(/[^぀-ゟ]/g, '');
}

/** Unifica la escritura de vocales largas: こう/こお → こう, せい/せえ → せい. */
function phonetic(kana: string): string {
  return kana.replace(/([おこそとのほもよろごぞどぼぽょ])お/g, '$1う').replace(/([えけせてねへめれげぜでべぺ])え/g, '$1い');
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
  const single = stripMarkup(displayText).replace(/[\[(【（].*?[\])】）]/g, '').replace(PUNCT, '');
  return single.length === 1 && KANJI_READINGS_MAP[single] ? KANJI_READINGS_MAP[single] : [];
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

/** Posibles lecturas en kana de lo que transcribió el reconocedor (que puede venir en kanji). */
function heardJapaneseReadings(transcript: string): string[] {
  const clean = transcript.replace(PUNCT, '');
  const direct = toKana(clean);
  if (direct) return [direct];

  const out = new Set<string>();
  if (JA_NUMBERS[clean]) out.add(JA_NUMBERS[clean].kana);
  getReadingsForWord(clean).forEach((r) => out.add(toKana(r)));

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
  return [...out];
}

function matchJapanese(card: CardLike, transcript: string): VoiceMatchResult {
  const expected = expectedJapaneseReadings(card);
  const surface = (card.displayText || '').replace(/[\[(【（].*?[\])】）]/g, '').replace(PUNCT, '');
  const clean = transcript.replace(PUNCT, '');

  // 1. Escribió exactamente la palabra de la tarjeta
  if (surface && clean === surface) {
    return { isMatch: true, matchedReading: expected[0] ?? surface, heard: expected[0] ?? surface };
  }

  const heard = heardJapaneseReadings(clean);
  // 2. Misma lectura (permitiendo vocales largas escritas distinto)
  for (const h of heard) {
    const hit = expected.find((e) => phonetic(e) === phonetic(h));
    if (hit) return { isMatch: true, matchedReading: hit, heard: hit };
  }

  // 3. Palabras largas: se tolera 1 sonido distinto (comparando en romaji)
  for (const h of heard) {
    const hr = hiraganaToRomaji(phonetic(h));
    for (const e of expected) {
      const er = hiraganaToRomaji(phonetic(e));
      if (er.length >= 8 && levenshtein(hr, er) <= 1) return { isMatch: true, matchedReading: e, heard: e };
    }
  }

  // 4. Palabras de UNA sola mora (こ, き, て…): el modelo suele oír sonora la consonante sorda
  //    cuando no se aspira (こ → ご), algo muy común en hispanohablantes. Solo en esa dirección:
  //    una tarjeta "ご" NO acepta "こ".
  for (const h of heard) {
    for (const e of expected) {
      if (isSingleMora(e) && unvoice(e) === e && unvoice(h) === e && h !== e) {
        return { isMatch: true, matchedReading: e, heard: e };
      }
    }
  }

  // Para mostrar: la lectura solo si no hay ambigüedad; si no, lo que se transcribió tal cual
  return { isMatch: false, heard: heard.length === 1 ? heard[0] : clean };
}

const VOICED: Record<string, string> = {
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ',
  ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ',
};
const unvoice = (kana: string) => kana.replace(/./g, (c) => VOICED[c] ?? c);
const isSingleMora = (kana: string) => /^[\u3041-\u3096][ゃゅょ]?$/.test(kana);

// ───────────── chino ─────────────

const toneless = (s: string) => toSearchKey(s || '').replace(/[^a-z]/g, '');

function matchChinese(card: CardLike, transcript: string): VoiceMatchResult {
  const hanzi = (card.displayText || '').replace(PUNCT, '');
  const reading = card.displayReading || '';
  const clean = transcript.replace(PUNCT, '');

  if (hanzi && clean === hanzi) return { isMatch: true, matchedReading: reading, heard: hanzi };
  const num = ZH_NUMBERS[clean];
  if (num && (num.hanzi === hanzi || toneless(num.pinyin) === toneless(reading))) {
    return { isMatch: true, matchedReading: reading, heard: num.hanzi };
  }
  // Si el reconocedor devolvió pinyin/latín, comparar sin tonos
  if (/^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+$/.test(transcript) && toneless(transcript) === toneless(reading)) {
    return { isMatch: true, matchedReading: reading, heard: transcript };
  }
  return { isMatch: false, heard: clean };
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

/** Compara UNA elocución completa con la tarjeta. */
export function checkVoiceMatch(rawCard: CardLike, transcript: string, lang: string): VoiceMatchResult {
  if (!transcript || !transcript.trim()) return { isMatch: false };
  const card = { ...rawCard, displayText: stripMarkup(rawCard.displayText), displayReading: stripMarkup(rawCard.displayReading) };
  const target = getEffectiveCardLanguage({ ...card, languageCode: card.languageCode || lang }).toLowerCase();
  if (target.startsWith('ja')) return matchJapanese(card, transcript);
  if (target.startsWith('zh')) return matchChinese(card, transcript);
  return matchAlphabetic(card, transcript);
}
