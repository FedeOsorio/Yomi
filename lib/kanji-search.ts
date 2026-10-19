import { KANJI_DATA } from './kanji-data';
import { katakanaToHiragana, romajiToHiragana } from './japanese-utils';

/**
 * Kanji sueltos: nivel JLPT del kanji (no de la palabra) y búsqueda de kanji por lectura.
 * Datos offline de lib/kanji-data.ts (KANJIDIC2 + niveles JLPT actuales).
 */
export interface KanjiInfo {
  kanji: string;
  /** 'N5' … 'N1', o undefined si no está en el JLPT. */
  level?: string;
  /** Ranking de frecuencia (1 = el más usado); 0 = sin dato. */
  freq: number;
  /** Lecturas on en hiragana. */
  on: string[];
  /** Lecturas kun con el okurigana entre paréntesis: つ(く). */
  kun: string[];
  /** Significados en inglés. */
  meanings: string[];
  /** Lectura que coincidió con la búsqueda, con el okurigana entre paréntesis: つく(る). */
  matchedReading?: string;
}

/** Las formas de prefijo/sufijo ("-つ.き") no se usan para buscar. */
const isAffix = (k: string) => k.startsWith('-') || k.endsWith('-');
/** "つく.る" → "つく(る)" */
const withOkurigana = (k: string) => (k.includes('.') ? k.replace(/\.(.*)$/, '($1)') : k);

/**
 * ¿La lectura kun coincide con la búsqueda? Vale la forma completa (つ.く → つく) y también la
 * parte que lee el kanji solo (つく.る → つく: 作 se lee "tsuku" en 作る).
 */
const kunMatches = (k: string, q: string) => k.replace('.', '') === q || k.split('.')[0] === q;

export function getKanjiInfo(char: string): KanjiInfo | undefined {
  const row = KANJI_DATA[char];
  if (!row) return undefined;
  const [level, freq, on, kun, meanings] = row;
  return {
    kanji: char,
    level: level ? `N${level}` : undefined,
    freq,
    on: on ? on.split(' ') : [],
    kun: kun
      ? kun
          .split(' ')
          .filter((k) => !isAffix(k))
          .map(withOkurigana)
      : [],
    meanings: meanings ? meanings.split('; ') : [],
  };
}

/** Nivel JLPT de un kanji suelto (員 → N4), o undefined. */
export function getKanjiLevel(char: string): string | undefined {
  const level = KANJI_DATA[char]?.[0];
  return level ? `N${level}` : undefined;
}

/** Orden: primero los niveles más básicos (N5…N1, sin nivel al final), luego los más frecuentes. */
function compareKanji(a: KanjiInfo, b: KanjiInfo): number {
  const la = a.level ? Number(a.level[1]) : 0;
  const lb = b.level ? Number(b.level[1]) : 0;
  if (la !== lb) return lb - la;
  return (a.freq || 99999) - (b.freq || 99999);
}

/**
 * Kanji que se leen como la búsqueda: "tsuku" → 付, 着, 作…; "shi" → 四, 子, 仕…
 * Acepta romaji, hiragana, katakana o un kanji suelto (devuelve ese kanji).
 */
export function searchKanji(query: string, limit = 10): KanjiInfo[] {
  const q = (query || '').trim();
  if (!q) return [];

  // Un kanji (o varios): mostrar cada uno
  if (/^[㐀-鿿]+$/.test(q) && [...q].length <= 4) {
    return [...new Set(q)].map(getKanjiInfo).filter((k): k is KanjiInfo => Boolean(k));
  }

  const reading = katakanaToHiragana(/[a-z]/i.test(q) ? romajiToHiragana(q.toLowerCase()) : q);
  if (!/^[ぁ-ゟ]+$/.test(reading)) return [];

  const hits: KanjiInfo[] = [];
  for (const [kanji, row] of Object.entries(KANJI_DATA)) {
    const on = row[2] ? row[2].split(' ') : [];
    const kun = row[3] ? row[3].split(' ').filter((k) => !isAffix(k)) : [];
    const kunHit = kun.find((k) => kunMatches(k, reading));
    const matched = on.includes(reading) ? reading : kunHit ? withOkurigana(kunHit) : undefined;
    if (matched) hits.push({ ...getKanjiInfo(kanji)!, matchedReading: matched });
  }
  return hits.sort(compareKanji).slice(0, limit);
}
