import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { KANJI_READINGS_MAP } from '../lib/kanji-readings-db';
import { registerWordInDictionary, setChineseDictionaryLookup, setDictionaryLookup } from '../lib/phonetic-dictionary';
import { checkVoiceMatch } from '../lib/voice-match';

/**
 * Banco de pruebas de la evaluación por voz en japonés y chino (lib/voice-match.ts), sin teléfono ni micrófono:
 * simula lo que escribe el reconocedor y comprueba la respuesta de checkVoiceMatch, con los diccionarios de la
 * app (assets/cedict/dictionary-v2.db).
 *
 *   npm run test:voice            resumen
 *   npm run test:voice -- --all   lista todos los fallos
 *
 * 1. Números, fechas, horas y contadores (lecturas irregulares: ついたち, はつか, いっぽん…), escritos en kanji,
 *    hiragana, katakana, cifras (26日), cifras anchas (２６日) y cifra + kana (8がつ).
 * 2. Las palabras comunes de JMdict: escritura, hiragana y katakana.
 * 3. Falsos aciertos: cada palabra contra 20 palabras distintas (siempre las mismas), que no debe aceptar.
 * 4. Las reglas de evaluación de AGENTS.md.
 * 5. Chino (CC-CEDICT): escritura tradicional, homófonos con el mismo tono, y falsos aciertos (mismas letras
 *    con otro tono, palabras al azar).
 *
 * Correrlo después de tocar lib/voice-match.ts o los diccionarios: aciertos al 100% y 0 falsos aciertos.
 */

const showAll = process.argv.includes('--all');
const dictPath = path.join(__dirname, '../assets/cedict/dictionary-v2.db');
const dict = new DatabaseSync(dictPath, { readOnly: true });
const byKanji = dict.prepare('SELECT DISTINCT hiragana FROM japanese_dictionary_entries WHERE kanji = ?');
setDictionaryLookup((word) => (byKanji.all(word) as { hiragana: string }[]).map((r) => r.hiragana));

const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const toFullwidth = (s: string) => s.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
const card = (text: string, reading: string) => ({ displayText: text, displayReading: reading, languageCode: 'ja-JP', deckType: 'language' as const });
const accepts = (text: string, reading: string, heard: string) => checkVoiceMatch(card(text, reading), heard, 'ja-JP').isMatch;

// ─── 1. Números ────────────────────────────────────────────────────────────────────────────────

const DIGIT = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const kanjiNumber = (n: number) => (n <= 10 ? DIGIT[n] : n < 20 ? '十' + DIGIT[n - 10] : DIGIT[Math.floor(n / 10)] + '十' + (n % 10 ? DIGIT[n % 10] : ''));
const DAYS = ['', 'ついたち', 'ふつか', 'みっか', 'よっか', 'いつか', 'むいか', 'なのか', 'ようか', 'ここのか', 'とおか',
  'じゅういちにち', 'じゅうににち', 'じゅうさんにち', 'じゅうよっか', 'じゅうごにち', 'じゅうろくにち', 'じゅうしちにち', 'じゅうはちにち', 'じゅうくにち', 'はつか',
  'にじゅういちにち', 'にじゅうににち', 'にじゅうさんにち', 'にじゅうよっか', 'にじゅうごにち', 'にじゅうろくにち', 'にじゅうしちにち', 'にじゅうはちにち', 'にじゅうくにち', 'さんじゅうにち', 'さんじゅういちにち'];
const MONTHS = ['', 'いちがつ', 'にがつ', 'さんがつ', 'しがつ', 'ごがつ', 'ろくがつ', 'しちがつ', 'はちがつ', 'くがつ', 'じゅうがつ', 'じゅういちがつ', 'じゅうにがつ'];
const HOURS = ['', 'いちじ', 'にじ', 'さんじ', 'よじ', 'ごじ', 'ろくじ', 'しちじ', 'はちじ', 'くじ', 'じゅうじ', 'じゅういちじ', 'じゅうにじ'];

/** [escritura, lectura, número, contador como lo escribe el reconocedor, lectura del contador si es regular] */
type NumberWord = [string, string, number, string[], string?];
const numbers: NumberWord[] = [
  ...DAYS.slice(1).map((r, i): NumberWord => [kanjiNumber(i + 1) + '日', r, i + 1, ['日']]),
  ...MONTHS.slice(1).map((r, i): NumberWord => [kanjiNumber(i + 1) + '月', r, i + 1, ['月'], 'がつ']),
  ...HOURS.slice(1).map((r, i): NumberWord => [kanjiNumber(i + 1) + '時', r, i + 1, ['時'], 'じ']),
  ['一分', 'いっぷん', 1, ['分']], ['三分', 'さんぷん', 3, ['分']], ['五分', 'ごふん', 5, ['分'], 'ふん'], ['十分', 'じゅっぷん', 10, ['分']],
  ['一人', 'ひとり', 1, ['人']], ['二人', 'ふたり', 2, ['人']], ['三人', 'さんにん', 3, ['人'], 'にん'],
  ['一つ', 'ひとつ', 1, ['つ']], ['九つ', 'ここのつ', 9, ['つ']], ['一本', 'いっぽん', 1, ['本']], ['三本', 'さんぼん', 3, ['本']], ['六本', 'ろっぽん', 6, ['本']],
  ['三百', 'さんびゃく', 300, ['']], ['六百', 'ろっぴゃく', 600, ['']], ['八百', 'はっぴゃく', 800, ['']], ['三千', 'さんぜん', 3000, ['']], ['八千', 'はっせん', 8000, ['']],
  ['一万', 'いちまん', 10000, ['']], ['百円', 'ひゃくえん', 100, ['円'], 'えん'], ['千円', 'せんえん', 1000, ['円'], 'えん'],
  ['二十歳', 'はたち', 20, ['歳']], ['三歳', 'さんさい', 3, ['歳'], 'さい'], ['一ヶ月', 'いっかげつ', 1, ['ヶ月', 'か月', 'カ月']], ['三か月', 'さんかげつ', 3, ['ヶ月', 'か月', 'カ月']],
  ['一回', 'いっかい', 1, ['回']], ['三階', 'さんがい', 3, ['階']], ['一匹', 'いっぴき', 1, ['匹']], ['三匹', 'さんびき', 3, ['匹']],
  ['二〇二四年', 'にせんにじゅうよねん', 2024, ['年']], ['九十九', 'きゅうじゅうきゅう', 99, ['']],
];

const misses: string[] = [];
const tally: Record<string, { ok: number; total: number }> = {};
function expectAccept(kind: string, text: string, reading: string, heard: string) {
  const t = (tally[kind] ??= { ok: 0, total: 0 });
  t.total++;
  if (accepts(text, reading, heard)) t.ok++;
  else misses.push(`${text} (${reading}) ← «${heard}» [${kind}]`);
}

for (const [text, reading, n, counters, counterReading] of numbers) {
  registerWordInDictionary(text, reading); // como en la app: las palabras de los mazos del usuario
  expectAccept('números: kanji', text, reading, text);
  expectAccept('números: kana', text, reading, reading);
  for (const c of counters) {
    expectAccept('números: cifras', text, reading, String(n) + c);
    expectAccept('números: cifras anchas', text, reading, toFullwidth(String(n)) + c);
  }
  if (counterReading) expectAccept('números: cifra + kana', text, reading, String(n) + counterReading);
}

// ─── 2. Palabras comunes del diccionario ───────────────────────────────────────────────────────

const words = dict
  .prepare("SELECT kanji, hiragana FROM japanese_dictionary_entries WHERE is_common = 1 AND kanji != '' AND kanji NOT GLOB '*[0-9０-９]*' GROUP BY kanji")
  .all() as { kanji: string; hiragana: string }[];
for (const w of words) {
  expectAccept('palabras: escritura', w.kanji, w.hiragana, w.kanji);
  expectAccept('palabras: hiragana', w.kanji, w.hiragana, w.hiragana);
  expectAccept('palabras: katakana', w.kanji, w.hiragana, toKatakana(w.hiragana));
}

// ─── 3. Falsos aciertos ────────────────────────────────────────────────────────────────────────

const allReadings = dict.prepare('SELECT DISTINCT hiragana FROM japanese_dictionary_entries WHERE kanji = ?');
const readingsOf = (text: string, reading: string) => {
  const set = new Set([reading, ...(allReadings.all(text) as { hiragana: string }[]).map((r) => r.hiragana)]);
  if ([...text].length === 1) (KANJI_READINGS_MAP[text] || []).forEach((r) => set.add(r.replace(/[.\-]/g, '')));
  return set;
};
let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pool = [...numbers.map(([text, reading]) => ({ kanji: text, hiragana: reading })), ...words];
const falsePositives: string[] = [];
let negatives = 0;
for (const w of pool) {
  const valid = readingsOf(w.kanji, w.hiragana);
  for (let i = 0; i < 20; i++) {
    const other = pool[Math.floor(random() * pool.length)];
    // Homófono de verdad (otra escritura de una lectura válida): aceptarlo es correcto
    if ([...readingsOf(other.kanji, other.hiragana)].some((r) => valid.has(r))) continue;
    negatives++;
    if (accepts(w.kanji, w.hiragana, other.kanji)) falsePositives.push(`${w.kanji} (${w.hiragana}) aceptó «${other.kanji}» (${other.hiragana})`);
  }
}

// ─── 4. Reglas de AGENTS.md ────────────────────────────────────────────────────────────────────

/** [escritura, lectura, lo que escribió el reconocedor, ¿se acepta?, regla] */
const rules: [string, string, string, boolean, string][] = [
  ['川', 'かわ', 'かは', true, 'は escrito donde suena わ'],
  ['子', 'こ', 'ご', true, 'una mora: こ oída sonora'],
  ['子', 'こ', '五', true, 'una mora: こ oída como 五'],
  ['子', 'こ', '5', true, 'una mora: こ oída como 5'],
  ['子', 'こ', 'こう', true, 'una mora alargada (kana)'],
  ['ご', 'ご', 'こ', false, 'sonoridad nunca al revés'],
  ['学校', 'がっこう', 'がっこ', true, 'vocal larga'],
  ['学校', 'がっこう', 'ガッコー', true, 'katakana con ー'],
  ['学校', 'がっこう', 'gakkou', true, 'romaji'],
  ['切手', 'きって', 'きて', true, 'っ absorbida'],
  ['山', 'やま', '山ま', true, 'kanji con su última sílaba repetida'],
  ['コンピューター', 'こんぴゅーたー', 'こんぴゅーだー', true, '1 sonido distinto en palabra larga'],
  ['先', 'せん', '千', true, 'kanji homófono'],
  ['先', 'さき', 'せん', true, 'kanji suelto: cualquier lectura'],
  ['先', 'せん', '先生', false, 'sin sufijos'],
  ['食べる', 'たべる', 'たべ', false, 'sin prefijos'],
  ['食べる', 'たべる', '食べた', false, 'sin conjugaciones'],
  ['来る', 'くる', 'こ', false, 'palabra con okurigana: solo su lectura'],
  ['二十六日', 'にじゅうろくにち', '27日', false, 'otro número'],
];
for (const [text, reading, heard, want, rule] of rules) {
  const t = (tally['reglas'] ??= { ok: 0, total: 0 });
  t.total++;
  if (accepts(text, reading, heard) === want) t.ok++;
  else misses.push(`${text} (${reading}) ${want ? 'debería aceptar' : 'no debería aceptar'} «${heard}» [regla: ${rule}]`);
}

// ─── 5. Chino (CC-CEDICT) ──────────────────────────────────────────────────────────────────────

const byHanzi = dict.prepare('SELECT DISTINCT pinyin_numeric FROM dictionary_entries WHERE simplified = ? OR traditional = ?');
setChineseDictionaryLookup((word) => (byHanzi.all(word, word) as { pinyin_numeric: string }[]).map((r) => r.pinyin_numeric));
const zhCard = (text: string, reading: string) => ({ displayText: text, displayReading: reading, languageCode: 'zh-CN', deckType: 'language' as const });
const zhAccepts = (text: string, reading: string, heard: string) => checkVoiceMatch(zhCard(text, reading), heard, 'zh-CN').isMatch;
// Pinyin comparable: sin espacios ni tono neutro ("bai3 ke4" = "bai3ke4")
const tonedKey = (numeric: string) => numeric.toLowerCase().replace(/u:/g, 'v').replace(/[5\s]/g, '');
const tonelessKey = (numeric: string) => tonedKey(numeric).replace(/[1-4]/g, '');
/** La tarjeta trae tonos escritos (si no, no hay tono contra el cual comparar) */
const hasWrittenTones = (display: string) => /[1-4]|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(display);

// Palabras de 1 a 3 hanzi (sin letras ni cifras), una lectura por escritura: como las tarjetas de un mazo.
// Fuera las que tienen una sílaba sin vocal (m2, ng4: 姆妈 = "mmā"): su tono no queda escrito con tildes y
// no hay contra qué comparar
const zhWords = (dict
  .prepare(
    `SELECT simplified, traditional, pinyin_display, pinyin_numeric FROM dictionary_entries
     WHERE length(simplified) BETWEEN 1 AND 3 AND simplified NOT GLOB '*[A-Za-z0-9]*'
       AND pinyin_numeric NOT GLOB '*[A-Z]*'
     GROUP BY simplified HAVING count(DISTINCT pinyin_numeric) = 1`
  )
  .all() as { simplified: string; traditional: string; pinyin_display: string; pinyin_numeric: string }[]).filter(
  (w) => !/(^|\s)(m|n|ng|hm|hng)[1-5]/i.test(w.pinyin_numeric)
);
const byToned = new Map<string, string[]>();
const byToneless = new Map<string, typeof zhWords>();
for (const w of zhWords) {
  byToned.set(tonedKey(w.pinyin_numeric), [...(byToned.get(tonedKey(w.pinyin_numeric)) ?? []), w.simplified]);
  byToneless.set(tonelessKey(w.pinyin_numeric), [...(byToneless.get(tonelessKey(w.pinyin_numeric)) ?? []), w]);
}
const zhSample = zhWords.filter((_, i) => i % 4 === 0); // una de cada cuatro: suficiente y rápido
const readingsOfHanzi = (h: string) => new Set((byHanzi.all(h, h) as { pinyin_numeric: string }[]).map((r) => tonedKey(r.pinyin_numeric)));
for (const w of zhSample) {
  const t = (kind: string, ok: boolean, heard: string) => {
    const entry = (tally[kind] ??= { ok: 0, total: 0 });
    entry.total++;
    if (ok) entry.ok++;
    else misses.push(`${w.simplified} (${w.pinyin_display}) ← «${heard}» [${kind}]`);
  };
  if (w.traditional !== w.simplified) t('chino: tradicional', zhAccepts(w.simplified, w.pinyin_display, w.traditional), w.traditional);
  const homophone = (byToned.get(tonedKey(w.pinyin_numeric)) ?? []).find((h) => h !== w.simplified);
  if (homophone) t('chino: homófono', zhAccepts(w.simplified, w.pinyin_display, homophone), homophone);
  // Mismas letras, otros tonos: otra palabra (是 shì por 十 shí). Sin contar las que solo cambian dónde se
  // corta la sílaba (翻案 fān'àn / 发难 fā nàn): el pinyin con tildes de la tarjeta (fānàn) no lo marca
  const tonesInOrder = (numeric: string) => tonedKey(numeric).replace(/[a-z]/g, '');
  const otherTone = (byToneless.get(tonelessKey(w.pinyin_numeric)) ?? []).find(
    (o) =>
      tonesInOrder(o.pinyin_numeric) !== tonesInOrder(w.pinyin_numeric) &&
      !readingsOfHanzi(o.simplified).has(tonedKey(w.pinyin_numeric))
  );
  if (otherTone && hasWrittenTones(w.pinyin_display)) {
    negatives++;
    if (zhAccepts(w.simplified, w.pinyin_display, otherTone.simplified))
      falsePositives.push(`${w.simplified} (${w.pinyin_display}) aceptó «${otherTone.simplified}» (${otherTone.pinyin_display}): otro tono`);
  }
  for (let i = 0; i < 10; i++) {
    const other = zhWords[Math.floor(random() * zhWords.length)];
    if (readingsOfHanzi(other.simplified).has(tonedKey(w.pinyin_numeric))) continue;
    negatives++;
    if (zhAccepts(w.simplified, w.pinyin_display, other.simplified))
      falsePositives.push(`${w.simplified} (${w.pinyin_display}) aceptó «${other.simplified}» (${other.pinyin_display})`);
  }
}

/** Reglas del chino: [hanzi, pinyin de la tarjeta, lo que escribió el reconocedor, ¿se acepta?, regla] */
const zhRules: [string, string, string, boolean, string][] = [
  ['十', 'shí', '拾', true, 'homófono con el mismo tono'],
  ['十', 'shí', '是', false, 'mismas letras, otro tono'],
  ['门', 'mén', '们', false, 'tono neutro no es segundo tono'],
  ['学校', 'xuéxiào', '學校', true, 'tradicional'],
  ['二十六号', 'èrshíliù hào', '26号', true, 'cifras'],
  ['八月', 'bāyuè', '9月', false, 'otro número'],
];
for (const [text, reading, heard, want, rule] of zhRules) {
  const t = (tally['reglas: chino'] ??= { ok: 0, total: 0 });
  t.total++;
  if (zhAccepts(text, reading, heard) === want) t.ok++;
  else misses.push(`${text} (${reading}) ${want ? 'debería aceptar' : 'no debería aceptar'} «${heard}» [regla: ${rule}]`);
}

// ─── Resultado ─────────────────────────────────────────────────────────────────────────────────

const total = Object.values(tally).reduce((s, t) => s + t.total, 0);
console.log(`Aciertos esperados: ${total - misses.length}/${total}`);
for (const [kind, t] of Object.entries(tally)) console.log(`  ${kind.padEnd(24)} ${t.ok}/${t.total}`);
console.log(`Falsos aciertos: ${falsePositives.length} de ${negatives} pruebas`);
const limit = showAll ? Infinity : 30;
misses.slice(0, limit).forEach((m) => console.log('  ✗', m));
falsePositives.slice(0, limit).forEach((f) => console.log('  ⚠', f));
if (!showAll && misses.length + falsePositives.length > 60) console.log('  … (--all para ver todos)');
process.exitCode = misses.length > 0 || falsePositives.length > 0 ? 1 : 0;
