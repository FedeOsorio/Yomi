/**
 * Análisis de una colección de Anki ya leída (notas + nombres de campos): decide qué campo es la palabra,
 * la lectura y el significado de cada tipo de nota, y arma los ítems de vocabulario con sus referencias de media.
 *
 * No depende de módulos nativos (ni SQLite ni sistema de archivos), así que se puede probar en Node
 * con mazos reales. La lectura del .apkg (zip, SQLite, zstd) está en anki-importer.
 */

import { decompress as zstdDecompress } from 'fzstd';
import { getKanjiEssentialReading } from './jlpt-data';
import { getMediaKind, MEDIA_PLACEHOLDERS, MediaKind } from './media-types';
import type { MediaItem } from './word-aux';

export interface ParsedVocabularyItem {
  text: string;
  reading?: string;
  meanings: string[];
  level?: string;
  rawExtras?: Record<string, string>;
  media?: MediaItem[];
}

/**
 * Limpia tags HTML comunes generados por Anki (ej: <div>, <br>, <b>, <span>, etc.)
 * y entidades HTML básicas (&nbsp;, &amp;, &lt;, &gt;).
 */
export function cleanHtmlAndAnkiTags(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\[sound:[^\]]+\]/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

/** Base (kanji) seguida de su lectura entre corchetes, como la escribe Anki: "一緒[いっしょ]". */
const FURIGANA_PATTERN = /([^\s\[\]]+)\[([^\]]*)\]/g;
const hasFurigana = (text: string) => /[^\s\[\]]\[[^\]]+\]/.test(text);

/**
 * Lectura en kana de un texto con sintaxis de furigana de Anki, conservando el okurigana:
 * "言[い]う" -> "いう", "友達[ともだち]と 一緒[いっしょ]に" -> "ともだちといっしょに".
 * (En Anki el espacio separa cada base del texto anterior: no forma parte de la lectura.)
 */
export function furiganaToKana(text: string): string {
  return text.replace(FURIGANA_PATTERN, '$2').replace(/\s+/g, '');
}

/** El mismo texto sin las lecturas: "友達[ともだち]と 一緒[いっしょ]に" -> "友達と一緒に". */
function furiganaToText(text: string): string {
  return text.replace(FURIGANA_PATTERN, '$1').replace(/\s+(?=[　-鿿＀-￯])/g, '').trim();
}

/**
 * Extrae texto y furigana si el string contiene la sintaxis clásica de Anki:
 * Ej: "漢字[かんじ]" -> { text: "漢字", reading: "かんじ" }; "食[た]べる" -> { text: "食べる", reading: "たべる" }
 */
export function parseAnkiFuriganaSyntax(raw: string): { text: string; reading?: string } {
  const cleaned = cleanHtmlAndAnkiTags(raw);
  if (!hasFurigana(cleaned)) return { text: cleaned };
  return { text: furiganaToText(cleaned), reading: furiganaToKana(cleaned) };
}

/**
 * Enriquece un ítem de vocabulario con la lectura esencial canónica (especialmente para Kanjis N5/N4)
 * y preserva el desglose On/Kun en rawExtras.
 */
export function enrichVocabularyItem(
  mainText: string,
  reading: string,
  meanings: string[],
  level?: string,
  extras?: Record<string, string>,
  media?: MediaItem[]
): ParsedVocabularyItem {
  const cleanMain = mainText.trim();
  const isSingleKanji = cleanMain.length === 1 && /[一-龯]/.test(cleanMain);
  let finalReading = reading.trim();
  const rawExtras: Record<string, string> = { ...(extras || {}) };

  if (isSingleKanji) {
    let rawOn = rawExtras.onReading || '';
    let rawKun = rawExtras.kunReading || '';
    if (!rawOn && !rawKun && (finalReading.includes('/') || /\b(on|kun)\b/i.test(finalReading) || finalReading.includes('•'))) {
      const parts = finalReading.split(/[\/•]/).map((p) => p.trim());
      parts.forEach((p) => {
        if (/^on[:：\s]/i.test(p) || /^[゠-ヿ\s,、]+$/.test(p)) {
          rawOn = p.replace(/^on[:：\s]*/i, '').trim();
        } else if (/^kun[:：\s]/i.test(p) || /^[぀-ゟ\s,、\-\~]+$/.test(p)) {
          rawKun = p.replace(/^kun[:：\s]*/i, '').trim();
        }
      });
    }

    const kanjiDetails = getKanjiEssentialReading(cleanMain, rawOn, rawKun);
    if (kanjiDetails.essentialReading && kanjiDetails.essentialReading !== cleanMain) {
      finalReading = kanjiDetails.essentialReading;
    }
    if (kanjiDetails.kanjiReadings) rawExtras.kanjiReadings = kanjiDetails.kanjiReadings;
    if (kanjiDetails.onReading) rawExtras.onReading = kanjiDetails.onReading;
    if (kanjiDetails.kunReading) rawExtras.kunReading = kanjiDetails.kunReading;
  }

  return {
    text: cleanMain,
    reading: finalReading || undefined,
    meanings,
    level: level || undefined,
    rawExtras: Object.keys(rawExtras).length > 0 ? rawExtras : undefined,
    media: media && media.length > 0 ? media : undefined,
  };
}

// ─── Campos ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Los nombres de campo de los mazos reales son de todo tipo: "Word Reading", "VocabKanji", "VocabDefEsp",
 * "SentAudio", "ja_on", "例文"… Se parten en palabras ("VocabDefEsp" -> vocab, def, esp) y se clasifican
 * por las palabras que contienen, en vez de comparar el nombre entero.
 */
function fieldTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes latinas (los kana con dakuten no usan este rango)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const tokenSet = (words: string) => new Set(words.split(' '));

/** Campos que nunca son el texto de la tarjeta (media, metadatos, notas). */
const IGNORED = tokenSet(
  'audio audios sound sonido image images imagen picture pic img photo foto video pitch accent notes note notas nota ' +
    'hint pista source fuente id noteid frequency freq frecuencia tags tag sort make card cards production extra ' +
    'comments comment occlusion header stroke strokes order reverse mnemonic mnemonics url link 音声 画像 備考'
);
const SENTENCE = tokenSet(
  'sent sentence sentences example examples ejemplo ejemplos exemplo phrase frase frases oracion oraciones context 例文'
);
const ON_READING = tokenSet('on onyomi 音読み');
const KUN_READING = tokenSet('kun kunyomi 訓読み');
const LEVEL = tokenSet('level jlpt hsk nivel');
const READING = tokenSet(
  'reading readings furigana kana yomi lectura leitura pinyin pronunciation pronunciacion romaji hiragana zhuyin 読み よみ 読み方'
);
const MEANING = tokenSet(
  'meaning meanings definition definitions def definicion translation traduccion traducao significado significados ' +
    'glossary gloss sense english back answer respuesta resposta 意味 訳 和訳 英訳'
);
const WORD = tokenSet(
  'word words vocab vocabulary kanji expression expr front term termino palabra palavra hanzi question pregunta ' +
    'pergunta target headword lemma 単語 語彙 漢字 表現 言葉'
);
const LANGUAGES: Record<string, Set<string>> = {
  es: tokenSet('es esp spa spanish espanol castellano'),
  en: tokenSet('en eng english ingles'),
  pt: tokenSet('pt por portugues portuguese br ptbr'),
  ja: tokenSet('ja jp jap jpn japanese japones 日本語'),
};

type FieldKind = 'ignored' | 'sentence' | 'on' | 'kun' | 'level' | 'reading' | 'meaning' | 'word' | 'unknown';

interface FieldInfo {
  kind: FieldKind;
  /** El campo es de la oración de ejemplo (aunque sea su audio). */
  isSentence: boolean;
  /** Lectura escrita como furigana ("私[わたし]") en vez de kana sola. */
  isFurigana: boolean;
  /** Idioma de un campo de significado ("VocabDefEsp" -> es). */
  lang?: string;
}

export function classifyField(name: string): FieldInfo {
  const tokens = fieldTokens(name);
  const has = (set: Set<string>) => tokens.some((t) => set.has(t));
  const isSentence = has(SENTENCE);
  const info = (kind: FieldKind, extra: Partial<FieldInfo> = {}): FieldInfo => ({
    kind,
    isSentence,
    isFurigana: false,
    ...extra,
  });

  if (has(IGNORED)) return info('ignored');
  if (isSentence) return info('sentence');
  if (has(ON_READING)) return info('on');
  if (has(KUN_READING)) return info('kun');
  if (has(LEVEL)) return info('level');
  if (has(READING)) return info('reading', { isFurigana: tokens.includes('furigana') });
  if (has(MEANING)) {
    const lang = Object.keys(LANGUAGES).find((l) => has(LANGUAGES[l]));
    return info('meaning', { lang });
  }
  if (has(WORD)) return info('word');
  return info('unknown');
}

/** Qué campo usar para cada dato, en orden de preferencia (por nota se toma el primero con contenido). */
export interface FieldPlan {
  fields: FieldInfo[];
  word: number[];
  reading: number[];
  meaning: number[];
  on: number;
  kun: number;
  level: number;
}

export function buildFieldPlan(fieldNames: string[], preferredLanguage?: string): FieldPlan {
  const fields = fieldNames.map(classifyField);
  const indicesOf = (kind: FieldKind) => fields.flatMap((f, i) => (f.kind === kind ? [i] : []));
  const unknown = indicesOf('unknown');

  // Sin un campo reconocible como palabra, el primero desconocido (y si tampoco hay, el primero de todos)
  let word = indicesOf('word');
  if (word.length === 0) word = unknown.length > 0 ? [unknown[0]] : [0];

  // Lectura en kana antes que furigana (la de furigana se convierte igual)
  const reading = indicesOf('reading').sort((a, b) => Number(fields[a].isFurigana) - Number(fields[b].isFurigana));

  // Significado en el idioma del usuario, después sin idioma, en inglés y el resto
  const langRank = (lang?: string) => (lang === preferredLanguage ? 0 : !lang ? 1 : lang === 'en' ? 2 : 3);
  let meaning = indicesOf('meaning').sort((a, b) => langRank(fields[a].lang) - langRank(fields[b].lang));
  if (meaning.length === 0) meaning = unknown.filter((i) => !word.includes(i));

  return {
    fields,
    word,
    reading,
    meaning,
    on: indicesOf('on')[0] ?? -1,
    kun: indicesOf('kun')[0] ?? -1,
    level: indicesOf('level')[0] ?? -1,
  };
}

// ─── Media ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Extrae referencias a archivos multimedia (audio, video, imagen) desde el contenido crudo
 * de un campo HTML de Anki antes de remover las etiquetas.
 */
export function extractMediaFromField(rawField: string, isSentence: boolean, isFront: boolean): MediaItem[] {
  if (!rawField) return [];
  const results: MediaItem[] = [];
  const seen = new Set<string>();
  const role: MediaItem['role'] = isSentence ? 'sentence' : isFront ? 'prompt' : 'word';

  const addMediaFile = (rawName: string) => {
    if (!rawName) return;
    let clean = rawName;
    try {
      clean = decodeURIComponent(clean);
    } catch {}
    clean = clean
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .trim()
      .normalize('NFC');

    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());

    const kind = getMediaKind(clean);
    if (!kind) return;

    results.push({ file: clean, kind, side: isFront ? 'front' : 'back', role });
  };

  // 1. [sound:archivo.mp3]
  for (const m of rawField.matchAll(/\[sound:([^\]]+)\]/gi)) addMediaFile(m[1] || '');
  // 2. <audio src="..."> o <video src="...">
  for (const m of rawField.matchAll(/<(audio|video)[^>]+src=["']([^"']+)["'][^>]*>/gi)) addMediaFile(m[2] || '');
  // 3. <img src="...">
  for (const m of rawField.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) addMediaFile(m[1] || '');

  return results;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** Los .apkg del formato nuevo de Anki (2.1.50+) comprimen con zstd la base, el índice de media y cada archivo. */
export function isZstd(bytes: Uint8Array): boolean {
  return ZSTD_MAGIC.every((b, i) => bytes[i] === b);
}

export function decompressZstd(bytes: Uint8Array): Uint8Array {
  return zstdDecompress(bytes);
}

/**
 * Las colecciones del formato nuevo declaran columnas con `COLLATE unicase`, una intercalación que sólo
 * existe dentro de Anki: cualquier otro SQLite falla al leer `fields` o `decks` ("no such collation sequence").
 * Se reemplaza en el esquema por `nocase` (incorporada en SQLite), que ocupa los mismos bytes, así que el
 * archivo sigue siendo válido. Se aplica sobre la copia que se lee al importar, nunca sobre el .apkg.
 */
export function relaxAnkiCollations(db: Uint8Array): Uint8Array {
  const from = new TextEncoder().encode('COLLATE unicase');
  const to = new TextEncoder().encode('COLLATE nocase ');
  for (let i = 0; i <= db.length - from.length; i++) {
    if (db[i] !== from[0]) continue;
    let match = true;
    for (let j = 1; j < from.length && match; j++) match = db[i + j] === from[j];
    if (match) {
      db.set(to, i);
      i += from.length - 1;
    }
  }
  return db;
}

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let factor = 1;
  for (;;) {
    const byte = buf[pos++];
    value += (byte & 0x7f) * factor;
    if (byte < 0x80) return [value, pos];
    factor *= 128;
  }
}

/** Saltea un campo protobuf que no se usa. */
function skipProtoField(buf: Uint8Array, pos: number, wireType: number): number {
  if (wireType === 0) return readVarint(buf, pos)[1];
  if (wireType === 1) return pos + 8;
  if (wireType === 5) return pos + 4;
  if (wireType === 2) {
    const [len, next] = readVarint(buf, pos);
    return next + len;
  }
  throw new Error(`Tipo de campo protobuf no soportado (${wireType})`);
}

/**
 * Índice de media del formato nuevo: `MediaEntries { repeated MediaEntry entries = 1 }` con
 * `MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; optional uint32 legacy_zip_filename = 255 }`.
 * Dentro del zip, el archivo de cada entrada se llama como su posición ("0", "1"…).
 */
function parseMediaEntries(buf: Uint8Array): Array<{ name: string; zipName: string }> {
  const decoder = new TextDecoder('utf-8');
  const entries: Array<{ name: string; zipName: string }> = [];
  let pos = 0;
  while (pos < buf.length) {
    const [key, afterKey] = readVarint(buf, pos);
    pos = afterKey;
    if (key >>> 3 !== 1 || (key & 7) !== 2) {
      pos = skipProtoField(buf, pos, key & 7);
      continue;
    }
    const [len, start] = readVarint(buf, pos);
    const end = start + len;
    let name = '';
    let legacyZipName: number | undefined;
    for (let p = start; p < end; ) {
      const [fieldKey, afterFieldKey] = readVarint(buf, p);
      const field = Math.floor(fieldKey / 8);
      const wireType = fieldKey & 7;
      p = afterFieldKey;
      if (field === 1 && wireType === 2) {
        const [strLen, strStart] = readVarint(buf, p);
        name = decoder.decode(buf.subarray(strStart, strStart + strLen));
        p = strStart + strLen;
      } else if (field === 255 && wireType === 0) {
        [legacyZipName, p] = readVarint(buf, p);
      } else {
        p = skipProtoField(buf, p, wireType);
      }
    }
    entries.push({ name, zipName: String(legacyZipName ?? entries.length) });
    pos = end;
  }
  return entries;
}

/**
 * Índice de media de un .apkg: nombre real del archivo -> nombre de su entrada en el zip.
 * Acepta el formato clásico (JSON `{"0": "neko.mp3"}`) y el nuevo (protobuf comprimido con zstd).
 * También se indexa en minúsculas, porque hay mazos que referencian los archivos con otra capitalización.
 */
export function decodeMediaIndex(bytes: Uint8Array): Map<string, string> {
  const pairs: Array<[string, string]> = isZstd(bytes)
    ? parseMediaEntries(decompressZstd(bytes)).map((e) => [e.name, e.zipName])
    : Object.entries(JSON.parse(new TextDecoder('utf-8').decode(bytes)) as Record<string, unknown>)
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
        .map(([zipName, name]) => [name, zipName]);

  const index = new Map<string, string>();
  for (const [name, zipName] of pairs) {
    const clean = name.trim().normalize('NFC');
    index.set(clean, zipName);
    if (!index.has(clean.toLowerCase())) index.set(clean.toLowerCase(), zipName);
  }
  return index;
}

// ─── Notas ──────────────────────────────────────────────────────────────────────────────────────

export interface AnkiNote {
  /** id del tipo de nota (notes.mid) */
  mid: number;
  /** campos separados por \x1f, como vienen en notes.flds */
  flds: string;
}

export interface ParsedAnkiCollection {
  languageCode: string;
  deckType: 'language' | 'custom';
  items: ParsedVocabularyItem[];
  /** Archivos que referencian las notas, con su tipo. */
  referencedMedia: Map<string, MediaKind>;
}

/** Un mazo de vocabulario no tiene palabras de más de esto: es una nota de bienvenida o instrucciones. */
const MAX_VOCAB_TEXT_LENGTH = 50;

/**
 * Convierte las notas de una colección en ítems de vocabulario.
 * @param fieldNamesByModel nombres de campo (en orden) de cada tipo de nota
 * @param preferredLanguage idioma del usuario ("es", "en"…), para elegir el campo de significado
 */
export function parseAnkiNotes(
  notes: AnkiNote[],
  fieldNamesByModel: Map<number, string[]>,
  deckName: string,
  preferredLanguage?: string
): ParsedAnkiCollection {
  const plans = new Map<number, FieldPlan>();
  const planFor = (mid: number) => {
    let plan = plans.get(mid);
    if (!plan) {
      plan = buildFieldPlan(fieldNamesByModel.get(mid) ?? [], preferredLanguage);
      plans.set(mid, plan);
    }
    return plan;
  };

  const items: ParsedVocabularyItem[] = [];
  const referencedMedia = new Map<string, MediaKind>();
  let hasJapaneseChars = false;
  let hasChineseChars = false;

  for (const note of notes) {
    const plan = planFor(note.mid);
    const rawFields = (note.flds || '').split('\x1f');
    const clean = rawFields.map(cleanHtmlAndAnkiTags);
    const firstWithContent = (indices: number[]) => indices.find((i) => clean[i]) ?? -1;

    const wordIdx = firstWithContent(plan.word);

    // Media de todos los campos, antes de que los tags se pierdan
    const noteMedia = rawFields.flatMap((raw, i) =>
      extractMediaFromField(raw, plan.fields[i]?.isSentence ?? false, i === (wordIdx >= 0 ? wordIdx : plan.word[0]))
    );
    for (const m of noteMedia) referencedMedia.set(m.file, m.kind);

    let text = wordIdx >= 0 ? clean[wordIdx] : '';
    const firstFrontMedia = noteMedia.find((m) => m.side === 'front');
    if (!text && firstFrontMedia) text = MEDIA_PLACEHOLDERS[firstFrontMedia.kind];
    if (!text) continue;

    let reading = '';
    const furigana = parseAnkiFuriganaSyntax(text);
    if (furigana.reading) {
      text = furigana.text;
      reading = furigana.reading;
    }

    const rawOn = plan.on >= 0 ? clean[plan.on].replace(/[・]/g, '').trim() : '';
    const rawKun = plan.kun >= 0 ? clean[plan.kun].replace(/[・]/g, '').trim() : '';
    if (!reading) {
      const readingIdx = firstWithContent(plan.reading);
      if (readingIdx >= 0) {
        reading = hasFurigana(clean[readingIdx]) ? furiganaToKana(clean[readingIdx]) : clean[readingIdx];
      } else if (rawOn && rawKun) {
        reading = `On: ${rawOn}  •  Kun: ${rawKun}`;
      } else if (rawOn) {
        reading = `On: ${rawOn}`;
      } else if (rawKun) {
        reading = `Kun: ${rawKun}`;
      }
    }
    reading = reading.replace(/[・]/g, '').trim();

    const meaningIdx = firstWithContent(plan.meaning);
    const meaning = meaningIdx >= 0 ? clean[meaningIdx] : '';
    const splitMeanings = meaning
      .split(/[;\n\r\/]+/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    if (/[぀-ヿ㐀-䶿一-鿿]/.test(text + reading)) {
      if (/[぀-ゟ゠-ヿ]/.test(text + reading)) hasJapaneseChars = true;
      else hasChineseChars = true;
    }

    items.push(
      enrichVocabularyItem(
        text,
        reading,
        splitMeanings.length > 0 ? splitMeanings : [meaning],
        plan.level >= 0 ? clean[plan.level] : undefined,
        {
          ...(rawOn ? { onReading: rawOn } : {}),
          ...(rawKun ? { kunReading: rawKun } : {}),
        },
        noteMedia
      )
    );
  }

  let languageCode: string;
  let deckType: 'language' | 'custom' = 'language';
  if (hasJapaneseChars || /jlpt|kanji|n5|n4|n3|n2|n1/i.test(deckName)) {
    languageCode = 'ja-JP';
  } else if (hasChineseChars || /hsk|hanzi|pinyin/i.test(deckName)) {
    languageCode = 'zh-CN';
  } else {
    // Mazo genérico o personalizado (Preguntas y Respuestas, Medicina, Historia, etc.)
    languageCode = 'es-ES';
    deckType = 'custom';
  }

  if (deckType === 'custom') {
    // La respuesta completa en el dorso, sin fragmentar por delimitadores de vocabulario
    for (const item of items) {
      item.reading = undefined;
      if (item.meanings.length > 1) item.meanings = [item.meanings.join('; ')];
    }
    return { languageCode, deckType, items, referencedMedia };
  }

  // Notas de bienvenida / instrucciones (p. ej. la primera de Kaishi): sin lectura, y con texto largo o sin significado
  const vocabItems = items.filter(
    (it) => it.reading || (it.text.length <= MAX_VOCAB_TEXT_LENGTH && it.meanings.some((m) => m.trim()))
  );
  return { languageCode, deckType, items: vocabItems, referencedMedia };
}
