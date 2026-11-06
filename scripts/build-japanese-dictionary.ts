import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Llena la tabla japonesa del diccionario de la app (japanese_dictionary_entries) con las palabras comunes
 * de JMdict: escrituras, lecturas, clave en romaji, tipo de palabra y significados en inglés por acepción (sin
 * las arcaicas ni raras). La tabla china (CC-CEDICT) se conserva tal cual.
 *
 * Uso:
 *   npm run build:dictionary:ja -- <jmdict-eng-X.json>
 *
 * El JSON es JMdict de https://github.com/scriptin/jmdict-simplified/releases (jmdict-eng-<versión>.json.tgz,
 * descomprimido). Escribe en assets/cedict/dictionary-v2.db, que crea build:dictionary (el chino): si se
 * regenera el chino, después hay que correr este de nuevo.
 *
 * Si cambia el contenido de una base ya publicada, hay que cambiarle el nombre (dictionary-v3.db) y actualizar
 * providers/DatabaseProvider.tsx: la app copia la base al teléfono una sola vez y, con el mismo nombre, se
 * queda con la vieja.
 *
 * JMdict es de EDRDG (https://www.edrdg.org/edrdg/licence.html), licencia CC BY-SA 4.0: la app debe mencionarlo.
 */

const ASSETS_DIR = path.join(__dirname, '../assets/cedict');
const TARGET = path.join(ASSETS_DIR, 'dictionary-v2.db');

interface JmdictForm {
  text: string;
  common: boolean;
  tags: string[];
  appliesToKanji?: string[];
}
interface JmdictWord {
  id: string;
  kanji: JmdictForm[];
  kana: (JmdictForm & { appliesToKanji: string[] })[];
  sense: { gloss: { text: string }[]; partOfSpeech: string[]; misc: string[] }[];
}

// ─── Kana ──────────────────────────────────────────────────────────────────────────────────────

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const ROMAJI: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

/** Clave en romaji sin espacios (きょう → kyou, がっこう → gakkou, ラーメン → raamen). */
function toRomajiKey(kana: string): string {
  const h = toHiragana(kana);
  let out = '';
  for (let i = 0; i < h.length; i++) {
    const c = h[i];
    const next = h[i + 1];
    if (c === 'っ') {
      const r = ROMAJI[next] || '';
      out += r.startsWith('ch') ? 't' : r[0] || '';
      continue;
    }
    if (c === 'ー') {
      out += out.slice(-1);
      continue;
    }
    if (next && YOON[next] && ROMAJI[c]?.endsWith('i') && c !== 'い') {
      const base = ROMAJI[c].slice(0, -1);
      out += (/(sh|ch|j)$/.test(base) ? base : base + 'y') + YOON[next];
      i++;
      continue;
    }
    out += ROMAJI[c] ?? '';
  }
  return out;
}

// ─── JMdict → filas ────────────────────────────────────────────────────────────────────────────

/** Una fila por par escritura + lectura (las palabras solo en kana van con kanji vacío). */
type Row = {
  id: string;
  entryId: string;
  formOrder: number;
  romaji: string;
  hiragana: string;
  kana: string;
  kanji: string;
  meanings: string;
  pos: string;
  common: number;
};

// Escrituras y lecturas que JMdict marca solo para búsqueda: no son la forma real de la palabra
const usable = (form: JmdictForm) => !form.tags.some((t) => t === 'sK' || t === 'sk');

// Acepciones que la búsqueda descarta (como hacía con Jisho): arcaicas, obsoletas, raras, vulgares, históricas
const UNUSUAL_SENSE = new Set(['arch', 'obs', 'rare', 'vulg', 'hist']);

/**
 * Tipo de palabra con los nombres que usa Jisho (los que entiende mapJishoPartsOfSpeech en la app).
 * Los que no hacen falta para clasificar quedan con su código de JMdict.
 */
function posName(code: string): string {
  if (code === 'v1' || code === 'v1-s') return 'Ichidan verb';
  if (code.startsWith('v5')) return 'Godan verb';
  if (code.startsWith('vs')) return 'Suru verb';
  if (code === 'vk') return 'Kuru verb - special class';
  if (code === 'adj-i' || code === 'adj-ix') return 'I-adjective (keiyoushi)';
  if (code === 'adj-na') return 'Na-adjective (keiyodoshi)';
  if (['n', 'n-pref', 'n-suf', 'pn', 'num', 'ctr'].includes(code)) return 'Noun';
  if (code === 'exp') return 'Expressions (phrases, clauses, etc.)';
  return code;
}

function rowsFrom(words: JmdictWord[]): Row[] {
  const rows: Row[] = [];
  for (const word of words) {
    if (!word.kanji.some((k) => k.common) && !word.kana.some((k) => k.common)) continue;

    const usualSenses = word.sense.filter((sense) => !sense.misc.some((m) => UNUSUAL_SENSE.has(m)));
    const senses = (usualSenses.length > 0 ? usualSenses : word.sense).slice(0, 5);
    // Significados por acepción: [["to eat"], ["to live on", "to subsist on"]]
    const meanings = JSON.stringify(senses.map((sense) => sense.gloss.map((g) => g.text)).filter((g) => g.length > 0));
    const pos = JSON.stringify([...new Set(senses.flatMap((sense) => sense.partOfSpeech.map(posName)))]);
    const kana = word.kana.filter(usable);
    const kanji = word.kanji.filter(usable);

    let order = 0;
    const push = (kj: string, k: JmdictForm, common: boolean) =>
      rows.push({
        id: `${word.id}-${order}`,
        entryId: word.id,
        formOrder: order++,
        romaji: toRomajiKey(k.text),
        hiragana: toHiragana(k.text),
        kana: k.text,
        kanji: kj,
        meanings,
        pos,
        common: common ? 1 : 0,
      });

    if (kanji.length === 0) {
      kana.forEach((k) => push('', k, k.common));
      continue;
    }
    for (const kj of kanji) {
      for (const k of kana) {
        if (k.appliesToKanji.includes('*') || k.appliesToKanji.includes(kj.text)) push(kj.text, k, kj.common && k.common);
      }
    }
  }
  return rows;
}

// ─── Base ──────────────────────────────────────────────────────────────────────────────────────

function main() {
  const jmdictPath = process.argv[2];
  if (!jmdictPath) {
    console.error('Falta el JSON de JMdict: npm run build:dictionary:ja -- <jmdict-eng-X.json>');
    process.exit(1);
  }
  if (!fs.existsSync(TARGET)) {
    console.error(`No está ${TARGET}. Ejecuta primero build:dictionary (scripts/build-dictionary.ts)`);
    process.exit(1);
  }

  console.log('Leyendo', jmdictPath);
  const jmdict = JSON.parse(fs.readFileSync(jmdictPath, 'utf8')) as { version: string; dictDate: string; words: JmdictWord[] };
  const rows = rowsFrom(jmdict.words);

  const db = new DatabaseSync(TARGET);
  // La tabla se vuelve a crear entera (su contenido sale todo de JMdict). Columnas en db/dict-schema.ts
  db.exec(`
    DROP TABLE IF EXISTS japanese_dictionary_entries;
    CREATE TABLE japanese_dictionary_entries (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      form_order INTEGER NOT NULL,
      romaji_key TEXT NOT NULL,
      hiragana TEXT NOT NULL,
      kana TEXT NOT NULL,
      kanji TEXT NOT NULL,
      meanings TEXT NOT NULL,
      parts_of_speech TEXT NOT NULL,
      jlpt_level TEXT,
      is_common INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX idx_ja_entry ON japanese_dictionary_entries(entry_id);
    CREATE INDEX idx_ja_romaji ON japanese_dictionary_entries(romaji_key);
    CREATE INDEX idx_ja_hiragana ON japanese_dictionary_entries(hiragana);
    CREATE INDEX idx_ja_kanji ON japanese_dictionary_entries(kanji);
  `);
  const insert = db.prepare(
    `INSERT INTO japanese_dictionary_entries
       (id, entry_id, form_order, romaji_key, hiragana, kana, kanji, meanings, parts_of_speech, jlpt_level, is_common)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  );
  db.exec('BEGIN');
  for (const r of rows) insert.run(r.id, r.entryId, r.formOrder, r.romaji, r.hiragana, r.kana, r.kanji, r.meanings, r.pos, r.common);
  db.exec('COMMIT');
  db.exec('VACUUM');
  const { n } = db.prepare('SELECT count(*) AS n FROM japanese_dictionary_entries').get() as { n: number };
  db.close();

  console.log(`JMdict ${jmdict.version} (${jmdict.dictDate}): ${n} filas de palabras comunes`);
  console.log(`Base: ${TARGET} (${(fs.statSync(TARGET).size / 1e6).toFixed(1)} MB)`);
}

main();
