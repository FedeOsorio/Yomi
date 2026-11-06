import fs from 'fs';
import path from 'path';

/**
 * Genera lib/conjugation-types.ts: el tipo exacto de conjugación de los verbos y adjetivos comunes de JMdict
 * (ichidan, godan por terminación, las excepciones como 行く, ある, いらっしゃる, 愛する, いい…), para que la
 * app conjugue y clasifique sin adivinar. También genera scripts/fixtures/conjugation-words.json, con el que
 * scripts/conjugation-audit.ts comprueba las conjugaciones.
 *
 * Uso: npm run build:conjugations -- <jmdict-eng-X.json>
 * (JMdict de https://github.com/scriptin/jmdict-simplified/releases, el mismo de build:dictionary:ja)
 */

/** Tipos de JMdict que conjugan (los demás son sustantivos, adverbios…). */
const CONJ_POS = /^(v1|v1-s|v5(u|u-s|k|k-s|g|s|t|n|b|m|r|r-i|aru)|vk|vs-i|vs-s|vz|adj-i|adj-ix|adj-na)$/;

interface Form { text: string; common: boolean; tags: string[]; appliesToKanji?: string[] }
interface Entry { kanji: Form[]; kana: Form[]; sense: { partOfSpeech: string[]; misc: string[] }[] }

function main() {
  const jmdictPath = process.argv[2];
  if (!jmdictPath) {
    console.error('Falta el JSON de JMdict: npm run build:conjugations -- <jmdict-eng-X.json>');
    process.exit(1);
  }
  const jmdict = JSON.parse(fs.readFileSync(jmdictPath, 'utf8')) as { version: string; words: Entry[] };
  const usable = (f: Form) => !f.tags.some((t) => t === 'sK' || t === 'sk');

  const byKanji = new Map<string, string>();
  const byKana = new Map<string, Set<string>>();
  const fixtures: [string, string, string][] = [];

  for (const w of jmdict.words) {
    if (!w.kanji.some((k) => k.common) && !w.kana.some((k) => k.common)) continue;
    // El tipo de la primera acepción (la principal)
    const type = w.sense[0]?.partOfSpeech.find((p) => CONJ_POS.test(p));
    if (!type) continue;
    const kanji = w.kanji.filter(usable);
    const kana = w.kana.filter(usable);
    for (const k of kanji) if (!byKanji.has(k.text)) byKanji.set(k.text, type);
    for (const k of kana) byKana.set(k.text, new Set([...(byKana.get(k.text) ?? []), type]));

    // Una palabra por entrada para la prueba: la escritura común (o la kana si se escribe en kana)
    const mainKana = kana.find((k) => k.common) ?? kana[0];
    const writtenInKana = !kanji.length || w.sense[0]?.misc.includes('uk');
    const mainKanji = writtenInKana ? undefined : kanji.find((k) => k.common) ?? kanji[0];
    if (mainKana) fixtures.push([mainKanji?.text ?? mainKana.text, mainKana.text, type]);
  }

  // Lectura en kana → tipo, solo si no es ambigua: きる es 切る (godan) y 着る (ichidan), y no se puede elegir
  const table: Record<string, string> = {};
  for (const [text, type] of byKanji) table[text] = type;
  for (const [text, types] of byKana) if (types.size === 1 && !(text in table)) table[text] = [...types][0];

  const out = path.join(__dirname, '../lib/conjugation-types.ts');
  const entries = Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1));
  fs.writeFileSync(
    out,
    `// Generado por scripts/build-conjugation-types.ts desde JMdict ${jmdict.version} (EDRDG, CC BY-SA 4.0). No editar a mano.\n` +
      `// Tipo de conjugación de cada verbo y adjetivo común: escritura (o lectura en kana, si no es ambigua) → código de JMdict.\n` +
      `export const CONJUGATION_TYPES: Record<string, string> = {\n` +
      entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') +
      `\n};\n`
  );
  const fixturePath = path.join(__dirname, 'fixtures/conjugation-words.json');
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(fixtures));
  console.log(`JMdict ${jmdict.version}: ${entries.length} escrituras con tipo, ${fixtures.length} palabras de prueba`);
  console.log(`${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

main();
