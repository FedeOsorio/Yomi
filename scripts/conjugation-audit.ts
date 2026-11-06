import fs from 'fs';
import path from 'path';
import { CONJUGATION_TYPES } from '../lib/conjugation-types';
import { classifyJapaneseWord, conjugateJapanese, JapaneseConjugationForm } from '../lib/japanese-utils';

/**
 * Prueba de las conjugaciones japonesas (lib/japanese-conjugation.ts, vía conjugateJapanese y
 * classifyJapaneseWord), sin teléfono:
 *
 *   npm run test:conjugation            resumen
 *   npm run test:conjugation -- --all   lista todos los fallos
 *
 * 1. Oráculo escrito a mano: verbos y adjetivos con sus formas correctas (las de cualquier libro), incluidas
 *    las excepciones (行く, ある, 来る y compuestos, 愛する, いい, adjetivos -na terminados en い…).
 * 2. Los verbos y adjetivos comunes de JMdict (scripts/fixtures/conjugation-words.json, de
 *    build:conjugations), de punta a punta: la categoría que deduce la app y la conjugación que sale,
 *    comparadas con una referencia por tipo.
 *
 * Correrlo después de tocar las conjugaciones: todo al 100%.
 */

const showAll = process.argv.includes('--all');
const failures: string[] = [];
const conj = (word: string, reading: string, form: JapaneseConjugationForm) =>
  conjugateJapanese(word, reading, classifyJapaneseWord(word, reading), form);

// ─── 1. Oráculo ────────────────────────────────────────────────────────────────────────────────

/** [escritura, lectura, categoría, te, ta, nai, masu] */
const VERBS: [string, string, string, string, string, string, string][] = [
  ['食べる', 'たべる', 'Verbo Ichidan (-ru)', '食べて', '食べた', '食べない', '食べます'],
  ['見る', 'みる', 'Verbo Ichidan (-ru)', '見て', '見た', '見ない', '見ます'],
  ['着る', 'きる', 'Verbo Ichidan (-ru)', '着て', '着た', '着ない', '着ます'],
  ['切る', 'きる', 'Verbo Godan (-ru)', '切って', '切った', '切らない', '切ります'],
  ['変える', 'かえる', 'Verbo Ichidan (-ru)', '変えて', '変えた', '変えない', '変えます'],
  ['帰る', 'かえる', 'Verbo Godan (-ru)', '帰って', '帰った', '帰らない', '帰ります'],
  ['入る', 'はいる', 'Verbo Godan (-ru)', '入って', '入った', '入らない', '入ります'],
  ['握る', 'にぎる', 'Verbo Godan (-ru)', '握って', '握った', '握らない', '握ります'],
  ['書く', 'かく', 'Verbo Godan (-u)', '書いて', '書いた', '書かない', '書きます'],
  ['行く', 'いく', 'Verbo Godan (-u)', '行って', '行った', '行かない', '行きます'],
  ['連れて行く', 'つれていく', 'Verbo Godan (-u)', '連れて行って', '連れて行った', '連れて行かない', '連れて行きます'],
  ['泳ぐ', 'およぐ', 'Verbo Godan (-u)', '泳いで', '泳いだ', '泳がない', '泳ぎます'],
  ['話す', 'はなす', 'Verbo Godan (-u)', '話して', '話した', '話さない', '話します'],
  ['待つ', 'まつ', 'Verbo Godan (-u)', '待って', '待った', '待たない', '待ちます'],
  ['死ぬ', 'しぬ', 'Verbo Godan (-u)', '死んで', '死んだ', '死なない', '死にます'],
  ['遊ぶ', 'あそぶ', 'Verbo Godan (-u)', '遊んで', '遊んだ', '遊ばない', '遊びます'],
  ['読む', 'よむ', 'Verbo Godan (-u)', '読んで', '読んだ', '読まない', '読みます'],
  ['買う', 'かう', 'Verbo Godan (-u)', '買って', '買った', '買わない', '買います'],
  ['問う', 'とう', 'Verbo Godan (-u)', '問うて', '問うた', '問わない', '問います'],
  ['ある', 'ある', 'Verbo Godan (-ru)', 'あって', 'あった', 'ない', 'あります'],
  ['いらっしゃる', 'いらっしゃる', 'Verbo Godan (-ru)', 'いらっしゃって', 'いらっしゃった', 'いらっしゃらない', 'いらっしゃいます'],
  ['来る', 'くる', 'Verbo Irregular', '来て', '来た', '来ない', '来ます'],
  ['持って来る', 'もってくる', 'Verbo Irregular', '持って来て', '持って来た', '持って来ない', '持って来ます'],
  ['やってくる', 'やってくる', 'Verbo Irregular', 'やってきて', 'やってきた', 'やってこない', 'やってきます'],
  ['する', 'する', 'Verbo Irregular', 'して', 'した', 'しない', 'します'],
  ['勉強する', 'べんきょうする', 'Verbo Irregular', '勉強して', '勉強した', '勉強しない', '勉強します'],
  ['愛する', 'あいする', 'Verbo Irregular', '愛して', '愛した', '愛さない', '愛します'],
  ['信ずる', 'しんずる', 'Verbo Irregular', '信じて', '信じた', '信じない', '信じます'],
  ['くくる', 'くくる', 'Verbo Godan (-ru)', 'くくって', 'くくった', 'くくらない', 'くくります'],
];
/** Lecturas que cambian aunque la escritura no: [escritura, lectura, forma, lectura esperada] */
const READINGS: [string, string, JapaneseConjugationForm, string][] = [
  ['来る', 'くる', 'nai', 'こない'],
  ['来る', 'くる', 'masu', 'きます'],
  ['持って来る', 'もってくる', 'nai', 'もってこない'],
  ['行く', 'いく', 'te', 'いって'],
];
/** [escritura, lectura, categoría, te, ta, nai, adverbial, masu] */
const ADJECTIVES: [string, string, string, string, string, string, string, string][] = [
  ['高い', 'たかい', 'Adjetivo -i', '高くて', '高かった', '高くない', '高く', '高いです'],
  ['すごい', 'すごい', 'Adjetivo -i', 'すごくて', 'すごかった', 'すごくない', 'すごく', 'すごいです'],
  ['強い', 'つよい', 'Adjetivo -i', '強くて', '強かった', '強くない', '強く', '強いです'],
  ['いい', 'いい', 'Adjetivo -i', 'よくて', 'よかった', 'よくない', 'よく', 'いいです'],
  ['良い', 'よい', 'Adjetivo -i', '良くて', '良かった', '良くない', '良く', '良いです'],
  ['かっこいい', 'かっこいい', 'Adjetivo -i', 'かっこよくて', 'かっこよかった', 'かっこよくない', 'かっこよく', 'かっこいいです'],
  ['綺麗', 'きれい', 'Adjetivo -na', '綺麗で', '綺麗だった', '綺麗じゃない', '綺麗に', '綺麗です'],
  ['有名', 'ゆうめい', 'Adjetivo -na', '有名で', '有名だった', '有名じゃない', '有名に', '有名です'],
  ['嫌い', 'きらい', 'Adjetivo -na', '嫌いで', '嫌いだった', '嫌いじゃない', '嫌いに', '嫌いです'],
  ['静か', 'しずか', 'Adjetivo -na', '静かで', '静かだった', '静かじゃない', '静かに', '静かです'],
];

let oracleTotal = 0;
const check = (label: string, got: string, want: string) => {
  oracleTotal++;
  if (got !== want) failures.push(`${label}: da «${got}», es «${want}»`);
};
for (const [w, r, cat, te, ta, nai, masu] of VERBS) {
  check(`${w} categoría`, classifyJapaneseWord(w, r), cat);
  check(`${w} te`, conj(w, r, 'te').kanji, te);
  check(`${w} ta`, conj(w, r, 'ta').kanji, ta);
  check(`${w} nai`, conj(w, r, 'nai').kanji, nai);
  check(`${w} masu`, conj(w, r, 'masu').kanji, masu);
}
for (const [w, r, form, want] of READINGS) check(`${w} ${form} (lectura)`, conj(w, r, form).reading, want);
for (const [w, r, cat, te, ta, nai, adv, masu] of ADJECTIVES) {
  check(`${w} categoría`, classifyJapaneseWord(w, r), cat);
  check(`${w} te`, conj(w, r, 'te').kanji, te);
  check(`${w} ta`, conj(w, r, 'ta').kanji, ta);
  check(`${w} nai`, conj(w, r, 'nai').kanji, nai);
  check(`${w} adverbial`, conj(w, r, 'adverbial').kanji, adv);
  check(`${w} masu`, conj(w, r, 'masu').kanji, masu);
}
const oracleFailures = failures.length;

// ─── 2. JMdict de punta a punta ────────────────────────────────────────────────────────────────

const GODAN: Record<string, [string, string, string, string]> = {
  う: ['わ', 'い', 'って', 'った'], つ: ['た', 'ち', 'って', 'った'], る: ['ら', 'り', 'って', 'った'],
  く: ['か', 'き', 'いて', 'いた'], ぐ: ['が', 'ぎ', 'いで', 'いだ'], す: ['さ', 'し', 'して', 'した'],
  ぬ: ['な', 'に', 'んで', 'んだ'], ぶ: ['ば', 'び', 'んで', 'んだ'], む: ['ま', 'み', 'んで', 'んだ'],
};
/** Referencia por tipo, escrita aparte del motor de la app (formas te, ta, nai, masu, y adverbial para adjetivos). */
function reference(t: string, type: string, form: string): string | undefined {
  const st = t.slice(0, -1);
  const pre = t.slice(0, -2);
  const v = (nai: string, i: string, te: string, ta: string) => ({ te, ta, nai, masu: i + 'ます' } as Record<string, string>)[form];
  if (type === 'v1' || type === 'v1-s') return v(st + 'ない', st, st + 'て', st + 'た');
  if (type === 'vk') return t.endsWith('来る') ? v(pre + '来ない', pre + '来', pre + '来て', pre + '来た') : v(pre + 'こない', pre + 'き', pre + 'きて', pre + 'きた');
  if (type === 'vs-i') return v(pre + 'しない', pre + 'し', pre + 'して', pre + 'した');
  if (type === 'vs-s') return v(pre + 'さない', pre + 'し', pre + 'して', pre + 'した');
  if (type === 'vz') return v(pre + 'じない', pre + 'じ', pre + 'じて', pre + 'じた');
  if (type.startsWith('v5')) {
    const g = GODAN[t.slice(-1)];
    if (!g) return undefined;
    const [a, i, te, ta] = g;
    const nai = type === 'v5r-i' ? st.slice(0, -1) + 'ない' : st + a + 'ない';
    const masuStem = type === 'v5aru' ? st + 'い' : st + i;
    if (type === 'v5k-s') return v(nai, masuStem, st + 'って', st + 'った');
    if (type === 'v5u-s') return v(nai, masuStem, t + 'て', t + 'た');
    return v(nai, masuStem, st + te, st + ta);
  }
  if (type === 'adj-i' || type === 'adj-ix') {
    const s = type === 'adj-ix' && t.endsWith('いい') ? t.slice(0, -2) + 'よ' : st;
    return ({ te: s + 'くて', ta: s + 'かった', nai: s + 'くない', adverbial: s + 'く' } as Record<string, string>)[form];
  }
  if (type === 'adj-na') return ({ te: t + 'で', ta: t + 'だった', nai: t + 'じゃない', adverbial: t + 'に' } as Record<string, string>)[form];
  return undefined;
}

const words: [string, string, string][] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/conjugation-words.json'), 'utf8')
);
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
let jmTotal = 0;
const jmFailures: string[] = [];
// Escritas solo en kana con una lectura de varios verbos de distinto tipo (いる: 要る / 居る): sin el kanji
// no se puede saber cuál es; la app elige la más común. No cuentan como fallo
const ambiguous: string[] = [];
for (const [w, r, type] of words) {
  if (/^[぀-ヿー]+$/.test(w) && !CONJUGATION_TYPES[w]) {
    ambiguous.push(w);
    continue;
  }
  const forms = type.startsWith('adj') ? ['te', 'ta', 'nai', 'adverbial'] : ['te', 'ta', 'nai', 'masu'];
  for (const form of forms) {
    const wantKanji = reference(w, type, form);
    const wantReading = reference(r, type, form);
    if (!wantKanji || !wantReading) continue;
    jmTotal++;
    const got = conj(w, r, form as JapaneseConjugationForm);
    if (got.kanji !== wantKanji || toHira(got.reading) !== toHira(wantReading)) {
      jmFailures.push(`${w}【${r}】 ${type} ${form}: da ${got.kanji}【${got.reading}】, es ${wantKanji}【${wantReading}】`);
    }
  }
}

// ─── Resultado ─────────────────────────────────────────────────────────────────────────────────

console.log(`Oráculo escrito a mano: ${oracleTotal - oracleFailures}/${oracleTotal}`);
console.log(`JMdict de punta a punta (${words.length - ambiguous.length} palabras): ${jmTotal - jmFailures.length}/${jmTotal} formas`);
console.log(`  (${ambiguous.length} escritas solo en kana y ambiguas, no se pueden decidir: ${ambiguous.join(', ')})`);
const limit = showAll ? Infinity : 30;
[...failures, ...jmFailures].slice(0, limit).forEach((f) => console.log('  ✗', f));
if (!showAll && failures.length + jmFailures.length > limit) console.log(`  … y ${failures.length + jmFailures.length - limit} más (--all)`);
const ok = failures.length === 0 && jmFailures.length === 0;
console.log(ok ? 'Todo bien' : 'HAY FALLOS');
process.exitCode = ok ? 0 : 1;
