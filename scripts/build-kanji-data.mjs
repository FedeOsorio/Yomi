/**
 * Genera lib/kanji-data.ts a partir de kanji-data (https://github.com/davidluzgouveia/kanji-data, MIT),
 * que reúne KANJIDIC2 (EDRDG, CC BY-SA 4.0) con los niveles JLPT actuales (N5–N1).
 *
 * Uso: node scripts/build-kanji-data.mjs
 * Se incluyen los kanji del JLPT y los jōyō (grados 1–8): unos 2.200.
 */
import { writeFileSync } from 'node:fs';

const SOURCE_URL = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';
const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`No se pudo descargar ${SOURCE_URL}: ${res.status}`);
const all = await res.json();

const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const data = {};
for (const [kanji, k] of Object.entries(all)) {
  const inJoyo = k.grade && k.grade <= 8;
  if (!k.jlpt_new && !inJoyo) continue;
  data[kanji] = [
    k.jlpt_new ?? 0, // nivel JLPT (5 = N5 … 1 = N1; 0 = sin nivel)
    k.freq ?? 0, // ranking de frecuencia en periódicos (1 = el más usado; 0 = sin dato)
    (k.readings_on || []).map(toHiragana).join(' '),
    (k.readings_kun || []).join(' '), // con punto antes del okurigana: つ.く
    (k.meanings || []).slice(0, 4).join('; '),
  ];
}

const header = `/**
 * Datos de kanji: nivel JLPT, frecuencia, lecturas y significados (en inglés).
 * GENERADO por scripts/build-kanji-data.mjs — no editar a mano.
 * Fuente: kanji-data (MIT) basado en KANJIDIC2 (EDRDG, CC BY-SA 4.0).
 * Formato: kanji → [jlpt (5=N5…1=N1, 0=sin nivel), frecuencia (1=más usado, 0=sin dato), on, kun, significados]
 */
export type KanjiRow = [number, number, string, string, string];
export const KANJI_DATA: Record<string, KanjiRow> = `;
writeFileSync(new URL('../lib/kanji-data.ts', import.meta.url), header + JSON.stringify(data) + ';\n');
console.log(`lib/kanji-data.ts: ${Object.keys(data).length} kanji`);
