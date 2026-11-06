import { CONJUGATION_TYPES } from './conjugation-types';

/**
 * Conjugación japonesa por tipo exacto (los códigos de JMdict), sin adivinar por la terminación:
 * - v1: ichidan (食べる) · v5u, v5k, v5g, v5s, v5t, v5n, v5b, v5m, v5r: godan según la terminación
 * - v5k-s: 行く y compuestos (連れて行く → 連れて行って) · v5r-i: ある (→ ない) · v5u-s: 問う (→ 問うて)
 * - v5aru: honoríficos (いらっしゃる → いらっしゃいます) · vk: 来る y compuestos (持って来る)
 * - vs-i: する y compuestos (勉強する) · vs-s: 愛する (→ 愛さない) · vz: 信ずる (→ 信じない)
 * - adj-i · adj-ix: いい y compuestos (かっこいい → かっこよくない) · adj-na (綺麗 → 綺麗じゃない)
 *
 * El tipo sale de lib/conjugation-types.ts (generado de JMdict). Para palabras que no están ahí, lo
 * deduce la categoría de la tarjeta (typeFromCategory). Se prueba con `npm run test:conjugation`.
 */

export type ConjugationForm =
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

const GODAN: Record<string, { a: string; i: string; te: string; ta: string }> = {
  う: { a: 'わ', i: 'い', te: 'って', ta: 'った' },
  つ: { a: 'た', i: 'ち', te: 'って', ta: 'った' },
  る: { a: 'ら', i: 'り', te: 'って', ta: 'った' },
  く: { a: 'か', i: 'き', te: 'いて', ta: 'いた' },
  ぐ: { a: 'が', i: 'ぎ', te: 'いで', ta: 'いだ' },
  す: { a: 'さ', i: 'し', te: 'して', ta: 'した' },
  ぬ: { a: 'な', i: 'に', te: 'んで', ta: 'んだ' },
  ぶ: { a: 'ば', i: 'び', te: 'んで', ta: 'んだ' },
  む: { a: 'ま', i: 'み', te: 'んで', ta: 'んだ' },
};

/**
 * La tarjeta puede traer el adjetivo -na con su な (静かな): se conjuga sin ella. Solo si la palabra sin la な
 * es un adjetivo -na conocido; 頑な (かたくな) u おとな llevan la な como parte de la palabra.
 */
export function withoutAttributiveNa(word: string, reading: string): { word: string; reading: string } {
  if (!word.endsWith('な') || CONJUGATION_TYPES[word] || CONJUGATION_TYPES[word.slice(0, -1)] !== 'adj-na') return { word, reading };
  return { word: word.slice(0, -1), reading: reading.endsWith('な') ? reading.slice(0, -1) : reading };
}

/** Tipo exacto de una palabra según JMdict: por su escritura, o por su lectura si se escribe en kana. */
export function conjugationTypeOf(word: string, reading?: string): string | undefined {
  const w = (word || '').trim();
  const byWord = CONJUGATION_TYPES[w];
  if (byWord) return byWord;
  // La lectura sola solo sirve si la palabra está escrita en kana (con kanji, el kanji manda: 着る ≠ 切る)
  if (/^[぀-ヿー]+$/.test(w) && reading) return CONJUGATION_TYPES[reading.trim()];
  return undefined;
}

/** Categoría de la app para un tipo de JMdict. */
export function categoryOfType(type: string, reading: string): string {
  if (type === 'v1' || type === 'v1-s') return 'Verbo Ichidan (-ru)';
  if (type === 'vk' || type.startsWith('vs') || type === 'vz') return 'Verbo Irregular';
  if (type.startsWith('v5')) return reading.endsWith('る') ? 'Verbo Godan (-ru)' : 'Verbo Godan (-u)';
  if (type.startsWith('adj-i')) return 'Adjetivo -i';
  return 'Adjetivo -na';
}

/** Tipo para una palabra que no está en JMdict, a partir de la categoría de la tarjeta. */
export function typeFromCategory(word: string, reading: string, category: string): string | undefined {
  if (category.includes('Ichidan')) return reading.endsWith('ずる') ? 'vz' : 'v1';
  if (category.includes('Irregular')) {
    if (word.endsWith('来る') || reading === 'くる' || /[てで]くる$/.test(reading)) return 'vk';
    if (word.endsWith('する') || reading.endsWith('する')) return 'vs-i';
    return undefined;
  }
  if (category.includes('Godan')) {
    if (word.endsWith('行く') || reading === 'いく' || /[てで]いく$/.test(reading)) return 'v5k-s';
    if (reading === 'ある') return 'v5r-i';
    if (/(いらっしゃ|おっしゃ|くださ|なさ|ござ)る$/.test(reading)) return 'v5aru';
    return GODAN[reading.slice(-1)] ? 'v5' : undefined;
  }
  if (category.includes('Adjetivo -i')) return ['いい', '良い', 'よい'].includes(word) ? 'adj-ix' : 'adj-i';
  if (category.includes('Adjetivo -na')) return 'adj-na';
  return undefined;
}

/**
 * Conjuga una escritura (sirve igual para la forma con kanji y para la lectura) según su tipo.
 * null si no se puede (la terminación no corresponde al tipo, o la forma no existe para él).
 */
export function conjugateByType(text: string, type: string, form: ConjugationForm): string | null {
  const stem = text.slice(0, -1);
  const verb = (a: string, i: string, te: string, ta: string, nai = a + 'ない'): string | null => {
    const forms: Record<string, string> = {
      te,
      nakute: nai.slice(0, -1) + 'くて',
      ta,
      nai,
      nakatta: nai.slice(0, -1) + 'かった',
      masu: i + 'ます',
      mashita: i + 'ました',
      masen: i + 'ません',
      mashou: i + 'ましょう',
    };
    return forms[form] ?? null;
  };

  if (type === 'v1' || type === 'v1-s') return text.endsWith('る') ? verb(stem, stem, stem + 'て', stem + 'た') : null;

  if (type === 'vk') {
    // 来る / くる y compuestos (持って来る, やってくる): con kanji la raíz no cambia; en kana, き / こ
    const pre = text.slice(0, -2);
    if (text.endsWith('来る')) return verb(pre + '来', pre + '来', pre + '来て', pre + '来た', pre + '来ない');
    if (text.endsWith('くる')) return verb(pre + 'こ', pre + 'き', pre + 'きて', pre + 'きた', pre + 'こない');
    return null;
  }

  if (type.startsWith('vs') || type === 'vz') {
    const pre = text.slice(0, -2);
    if (type === 'vz') return text.endsWith('ずる') ? verb(pre + 'じ', pre + 'じ', pre + 'じて', pre + 'じた', pre + 'じない') : null;
    if (!text.endsWith('する')) return null;
    // 愛する → 愛さない (vs-s); する / 勉強する → しない
    const a = type === 'vs-s' ? pre + 'さ' : pre + 'し';
    return verb(a, pre + 'し', pre + 'して', pre + 'した', a + 'ない');
  }

  if (type.startsWith('v5')) {
    const g = GODAN[text.slice(-1)];
    if (!g) return null;
    let te = stem + g.te;
    let ta = stem + g.ta;
    let i = stem + g.i;
    let nai = stem + g.a + 'ない';
    if (type === 'v5k-s') [te, ta] = [stem + 'って', stem + 'った']; // 行く → 行って
    if (type === 'v5u-s') [te, ta] = [text + 'て', text + 'た']; // 問う → 問うて
    if (type === 'v5r-i') nai = stem.slice(0, -1) + 'ない'; // ある → ない
    if (type === 'v5aru') i = stem + 'い'; // いらっしゃる → いらっしゃいます
    return verb(stem + g.a, i, te, ta, nai);
  }

  if (type === 'adj-i' || type === 'adj-ix') {
    if (!text.endsWith('い')) return null;
    // いい y sus compuestos se conjugan con よ (かっこいい → かっこよくない); 良い ya la tiene
    let s = stem;
    if (type === 'adj-ix') s = text.endsWith('良い') ? stem : text.endsWith('いい') ? text.slice(0, -2) + 'よ' : stem;
    const forms: Record<string, string> = {
      te: s + 'くて',
      nakute: s + 'くなくて',
      ta: s + 'かった',
      nai: s + 'くない',
      nakatta: s + 'くなかった',
      adverbial: s + 'く',
      masu: text + 'です',
      mashita: s + 'かったです',
      masen: s + 'くないです',
    };
    return forms[form] ?? null;
  }

  if (type === 'adj-na') {
    const base = text;
    const forms: Record<string, string> = {
      te: base + 'で',
      nakute: base + 'じゃなくて',
      ta: base + 'だった',
      nai: base + 'じゃない',
      nakatta: base + 'じゃなかった',
      adverbial: base + 'に',
      masu: base + 'です',
      mashita: base + 'でした',
      masen: base + 'じゃありません',
    };
    return forms[form] ?? null;
  }
  return null;
}
