import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Agrega los significados en español de JMdict a la tabla japonesa del diccionario de la app
 * (columna meanings_es de japanese_dictionary_entries), cruzando por el número de entrada de JMdict. Así las
 * palabras se agregan con su significado en español sin internet; las que no tienen español siguen usando el
 * inglés traducido por internet (lib/japanese-search.ts).
 *
 * Uso:
 *   npm run build:dictionary:es -- <jmdict-spa-X.json>
 *
 * El JSON es https://github.com/scriptin/jmdict-simplified/releases (jmdict-spa-<versión>.json.tgz, descomprimido).
 * build:dictionary:ja recrea la tabla japonesa: después de correrlo hay que correr este de nuevo.
 *
 * Si cambia el contenido de una base ya publicada, hay que cambiarle el nombre y actualizar
 * providers/DatabaseProvider.tsx: la app copia la base al teléfono una sola vez.
 *
 * JMdict es de EDRDG (https://www.edrdg.org/edrdg/licence.html), licencia CC BY-SA 4.0.
 */

const TARGET = path.join(__dirname, '../assets/cedict/dictionary-v3.db');
/** Acepciones que se guardan por palabra (las primeras son las más usadas). */
const MAX_SENSES = 4;

interface SpanishWord {
  id: string;
  sense: { gloss: { text: string }[] }[];
}

/** Quita las notas en inglés que trae la traducción ("inflación (eng: inflation)") y los espacios de más. */
const clean = (text: string) => text.replace(/\s*\(eng:[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();

/** Acepciones en español de una entrada, sin glosas repetidas (ni dentro de una acepción ni entre acepciones). */
function spanishSenses(word: SpanishWord): string[][] {
  const seen = new Set<string>();
  const senses: string[][] = [];
  for (const sense of word.sense) {
    const glosses: string[] = [];
    for (const g of sense.gloss) {
      const text = clean(g.text);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      glosses.push(text);
    }
    if (glosses.length > 0) senses.push(glosses);
    if (senses.length === MAX_SENSES) break;
  }
  return senses;
}

function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    console.error('Uso: npm run build:dictionary:es -- <jmdict-spa-X.json>');
    process.exit(1);
  }
  const jmdict = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { version: string; words: SpanishWord[] };

  const db = new DatabaseSync(TARGET);
  const columns = db.prepare('PRAGMA table_info(japanese_dictionary_entries)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'meanings_es')) db.exec('ALTER TABLE japanese_dictionary_entries ADD COLUMN meanings_es TEXT');

  db.exec('BEGIN');
  db.exec('UPDATE japanese_dictionary_entries SET meanings_es = NULL');
  const update = db.prepare('UPDATE japanese_dictionary_entries SET meanings_es = ? WHERE entry_id = ?');
  for (const word of jmdict.words) {
    const senses = spanishSenses(word);
    if (senses.length > 0) update.run(JSON.stringify(senses), word.id);
  }
  db.exec('COMMIT');

  const stats = db
    .prepare(
      `SELECT count(DISTINCT entry_id) AS total,
              count(DISTINCT CASE WHEN meanings_es IS NOT NULL THEN entry_id END) AS spanish
       FROM japanese_dictionary_entries`
    )
    .get() as { total: number; spanish: number };
  db.exec('VACUUM');
  db.close();
  console.log(`JMdict español ${jmdict.version}: ${stats.spanish} de ${stats.total} palabras con significado en español`);
}

main();
