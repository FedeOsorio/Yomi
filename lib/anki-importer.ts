/**
 * Módulo desacoplado para análisis (parsing) y transformación de archivos exportados
 * desde Anki, CSV, TSV y texto plano hacia estructuras de datos universales de vocabulario.
 *
 * Este servicio NO depende de la UI ni de frameworks de presentación para garantizar
 * máxima escalabilidad, testabilidad y reutilización en cualquier entorno.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { unzipSync } from 'fflate';

export interface RawImportRow {
  [key: string]: string;
}

export interface ParsedVocabularyItem {
  text: string;
  reading?: string;
  meanings: string[];
  level?: string;
  rawExtras?: Record<string, string>;
}

export interface ColumnMapping {
  textColumnIndex: number;
  readingColumnIndex?: number;
  meaningColumnIndex: number;
  levelColumnIndex?: number;
}

export interface ParseResult {
  delimiter: string;
  hasHeader: boolean;
  headers: string[];
  sampleRows: string[][];
  suggestedMapping: ColumnMapping;
  items: ParsedVocabularyItem[];
  totalParsed: number;
  warnings: string[];
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

/**
 * Extrae texto y furigana si el string contiene la sintaxis clásica de Anki:
 * Ej: "漢字[かんじ]" -> { text: "漢字", reading: "かんじ" }
 */
export function parseAnkiFuriganaSyntax(raw: string): { text: string; reading?: string } {
  const cleaned = cleanHtmlAndAnkiTags(raw);
  if (!cleaned.includes('[') || !cleaned.includes(']')) {
    return { text: cleaned };
  }

  // Regex para emparejar patrones como "漢字[かんじ]" o "私[わたし]"
  const bracketMatches = cleaned.match(/([^\s\[\]]+)\[([^\s\[\]]+)\]/g);
  if (bracketMatches && bracketMatches.length > 0) {
    let mainText = cleaned;
    const readings: string[] = [];

    bracketMatches.forEach((m) => {
      const parts = m.match(/([^\s\[\]]+)\[([^\s\[\]]+)\]/);
      if (parts) {
        const kanjiPart = parts[1];
        const kanaPart = parts[2];
        mainText = mainText.replace(m, kanjiPart);
        readings.push(kanaPart);
      }
    });

    return {
      text: mainText.trim(),
      reading: readings.join(''),
    };
  }

  return { text: cleaned };
}

/**
 * Detecta automáticamente el delimitador más probable (coma, tabulación, punto y coma, pipe).
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return ',';

  const sampleLines = lines.slice(0, 10);
  const counts = {
    '\t': 0,
    ',': 0,
    ';': 0,
    '|': 0,
  };

  sampleLines.forEach((line) => {
    // Contar ocurrencias fuera de comillas
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === '\t') counts['\t']++;
        else if (char === ',') counts[',']++;
        else if (char === ';') counts[';']++;
        else if (char === '|') counts['|']++;
      }
    }
  });

  // El delimitador con mayor frecuencia consistente
  let bestDelimiter = ',';
  let maxCount = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount && count >= sampleLines.length) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parsea una línea respetando comillas y delimitadores.
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Saltar la comilla escapada
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Deduce automáticamente qué columna corresponde a la palabra, lectura y significado
 * según los nombres de los encabezados o los contenidos típicos.
 */
export function guessColumnMapping(headers: string[], firstRowSample?: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  let textIdx = -1;
  let readingIdx = -1;
  let meaningIdx = -1;
  let levelIdx = -1;

  // 1. Detección por palabras clave en encabezados
  normalizedHeaders.forEach((h, idx) => {
    if (textIdx === -1 && /^(kanji|hanzi|word|vocab|front|término|termino|palabra|caracter|expression|expr)$/i.test(h)) {
      textIdx = idx;
    } else if (readingIdx === -1 && /^(furigana|reading|lectura|pronunciación|pronunciacion|pinyin|kana|romaji|kana_reading)$/i.test(h)) {
      readingIdx = idx;
    } else if (meaningIdx === -1 && /^(meaning|meanings|significado|significados|translation|traducción|traduccion|definition|back|glossary)$/i.test(h)) {
      meaningIdx = idx;
    } else if (levelIdx === -1 && /^(level|jlpt|hsk|nivel|section)$/i.test(h)) {
      levelIdx = idx;
    }
  });

  // 2. Si no se encontró por encabezado exacto, probar coincidencias parciales
  if (textIdx === -1) {
    textIdx = normalizedHeaders.findIndex((h) => h.includes('word') || h.includes('kanji') || h.includes('front') || h.includes('term'));
  }
  if (readingIdx === -1) {
    readingIdx = normalizedHeaders.findIndex((h) => h.includes('read') || h.includes('furi') || h.includes('pinyin') || h.includes('kana'));
  }
  if (meaningIdx === -1) {
    meaningIdx = normalizedHeaders.findIndex((h) => h.includes('mean') || h.includes('trad') || h.includes('sign') || h.includes('back') || h.includes('def'));
  }

  // 3. Si aún no hay mapeo (o no había encabezados válidos), usar posiciones por defecto estándar
  const totalCols = headers.length > 0 ? headers.length : (firstRowSample?.length || 2);
  if (textIdx === -1) textIdx = 0;
  if (meaningIdx === -1) {
    meaningIdx = totalCols >= 3 ? 2 : (totalCols >= 2 ? 1 : 0);
  }
  if (readingIdx === -1 && totalCols >= 3 && textIdx !== 1 && meaningIdx !== 1) {
    readingIdx = 1;
  }

  return {
    textColumnIndex: textIdx >= 0 ? textIdx : 0,
    readingColumnIndex: readingIdx >= 0 && readingIdx !== textIdx && readingIdx !== meaningIdx ? readingIdx : undefined,
    meaningColumnIndex: meaningIdx >= 0 ? meaningIdx : 1,
    levelColumnIndex: levelIdx >= 0 ? levelIdx : undefined,
  };
}

/**
 * Determina si la primera fila representa encabezados descriptivos o datos directos.
 */
export function isHeaderRow(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  const commonHeaderKeywords = [
    'kanji', 'furigana', 'romaji', 'meaning', 'section',
    'word', 'reading', 'translation', 'definition',
    'front', 'back', 'palabra', 'lectura', 'significado',
    'hanzi', 'pinyin', 'level', 'jlpt', 'hsk',
  ];

  const matchCount = row.filter((col) => {
    const clean = col.toLowerCase().trim();
    return commonHeaderKeywords.some((kw) => clean === kw || clean.includes(kw));
  }).length;

  return matchCount >= 1;
}

/**
 * Analiza texto completo exportado (CSV, TSV o TXT) y genera el resultado estructurado
 * con sugerencia de columnas y filas parseadas.
 */
export function parseVocabularyFile(content: string, customDelimiter?: string): ParseResult {
  const warnings: string[] = [];
  if (!content || !content.trim()) {
    return {
      delimiter: ',',
      hasHeader: false,
      headers: [],
      sampleRows: [],
      suggestedMapping: { textColumnIndex: 0, meaningColumnIndex: 1 },
      items: [],
      totalParsed: 0,
      warnings: ['El contenido está vacío.'],
    };
  }

  // Si el archivo es un paquete nativo Yomi (.yomi / JSON)
  if (isYomiPackage(content)) {
    try {
      const pkg = JSON.parse(content) as YomiDeckExportPackage;
      const items: ParsedVocabularyItem[] = (pkg.cards || []).map((c) => ({
        text: c.text,
        reading: c.reading || undefined,
        meanings: c.meanings,
        level: c.level || undefined,
      }));

      return {
        delimiter: 'Yomi (JSON)',
        hasHeader: true,
        headers: ['Palabra / Kanji', 'Lectura', 'Significados', 'Nivel'],
        sampleRows: items.slice(0, 5).map((it) => [it.text, it.reading || '', it.meanings.join(', '), it.level || '']),
        suggestedMapping: { textColumnIndex: 0, readingColumnIndex: 1, meaningColumnIndex: 2, levelColumnIndex: 3 },
        items,
        totalParsed: items.length,
        warnings: [],
      };
    } catch (e) {
      warnings.push('Error al procesar paquete Yomi, intentando como texto plano...');
    }
  }

  const rawLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = customDelimiter || detectDelimiter(content);

  const parsedGrid: string[][] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cols = parseCsvLine(rawLines[i], delimiter);
    if (cols.some((c) => c.length > 0)) {
      parsedGrid.push(cols);
    }
  }

  if (parsedGrid.length === 0) {
    return {
      delimiter,
      hasHeader: false,
      headers: [],
      sampleRows: [],
      suggestedMapping: { textColumnIndex: 0, meaningColumnIndex: 1 },
      items: [],
      totalParsed: 0,
      warnings: ['No se encontraron filas con datos.'],
    };
  }

  const firstRow = parsedGrid[0];
  const hasHeader = isHeaderRow(firstRow);
  const headers = hasHeader ? firstRow : firstRow.map((_, i) => `Columna ${i + 1}`);
  const dataRows = hasHeader ? parsedGrid.slice(1) : parsedGrid;

  const mapping = guessColumnMapping(headers, dataRows[0]);
  const sampleRows = dataRows.slice(0, 5);

  // Convertir las filas a ParsedVocabularyItem
  const items: ParsedVocabularyItem[] = [];

  dataRows.forEach((row, rowIdx) => {
    const rawText = row[mapping.textColumnIndex] || '';
    const rawReading = mapping.readingColumnIndex !== undefined ? row[mapping.readingColumnIndex] : '';
    const rawMeaning = row[mapping.meaningColumnIndex] || '';
    const rawLevel = mapping.levelColumnIndex !== undefined ? row[mapping.levelColumnIndex] : '';

    if (!rawText.trim() && !rawMeaning.trim()) {
      return; // Fila vacía
    }

    // Limpieza de HTML y furigana
    const ankiExtracted = parseAnkiFuriganaSyntax(rawText);
    const mainText = ankiExtracted.text || cleanHtmlAndAnkiTags(rawText);
    const reading = cleanHtmlAndAnkiTags(rawReading) || ankiExtracted.reading || '';
    const cleanMeaningStr = cleanHtmlAndAnkiTags(rawMeaning);

    // Separar significados múltiples delimitados por punto y coma, comas internas o saltos de línea
    const splitMeanings = cleanMeaningStr
      .split(/[;\n\r\/]+/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const meanings = splitMeanings.length > 0 ? splitMeanings : [cleanMeaningStr];

    items.push({
      text: mainText,
      reading: reading || undefined,
      meanings,
      level: cleanHtmlAndAnkiTags(rawLevel) || undefined,
    });
  });

  return {
    delimiter,
    hasHeader,
    headers,
    sampleRows,
    suggestedMapping: mapping,
    items,
    totalParsed: items.length,
    warnings,
  };
}

/**
 * Transforma un lote de ParsedVocabularyItem con un mapeo manual definido por el usuario.
 */
export function applyMappingToRows(
  rows: string[][],
  mapping: ColumnMapping
): ParsedVocabularyItem[] {
  const items: ParsedVocabularyItem[] = [];

  rows.forEach((row) => {
    const rawText = row[mapping.textColumnIndex] || '';
    const rawReading = mapping.readingColumnIndex !== undefined ? row[mapping.readingColumnIndex] : '';
    const rawMeaning = row[mapping.meaningColumnIndex] || '';
    const rawLevel = mapping.levelColumnIndex !== undefined ? row[mapping.levelColumnIndex] : '';

    if (!rawText.trim() && !rawMeaning.trim()) return;

    const ankiExtracted = parseAnkiFuriganaSyntax(rawText);
    const mainText = ankiExtracted.text || cleanHtmlAndAnkiTags(rawText);
    const reading = cleanHtmlAndAnkiTags(rawReading) || ankiExtracted.reading || '';
    const cleanMeaningStr = cleanHtmlAndAnkiTags(rawMeaning);

    const splitMeanings = cleanMeaningStr
      .split(/[;\n\r\/]+/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    items.push({
      text: mainText,
      reading: reading || undefined,
      meanings: splitMeanings.length > 0 ? splitMeanings : [cleanMeaningStr],
      level: cleanHtmlAndAnkiTags(rawLevel) || undefined,
    });
  });

  return items;
}

export interface YomiDeckExportPackage {
  format: 'yomi-deck-v1';
  version: number;
  exportedAt: string;
  deck: {
    name: string;
    languageCode: string;
  };
  cards: Array<{
    text: string;
    reading: string;
    meanings: string[];
    level?: string;
    selectedMeanings?: string[];
  }>;
}

/**
 * Serializa un mazo completo al formato nativo Yomi (.yomi / JSON estructurado).
 */
export function exportDeckToYomiFormat(
  deck: { name: string; languageCode: string },
  cards: Array<{
    simplified: string;
    displayReading?: string;
    meanings: string;
    resolvedLevel?: string;
    auxiliaryInfo?: string | null;
  }>
): string {
  const payload: YomiDeckExportPackage = {
    format: 'yomi-deck-v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    deck: {
      name: deck.name,
      languageCode: deck.languageCode,
    },
    cards: cards.map((c) => {
      let meaningsArray: string[] = [];
      try {
        const parsed = JSON.parse(c.meanings);
        meaningsArray = Array.isArray(parsed) ? parsed : [String(c.meanings)];
      } catch {
        meaningsArray = [c.meanings];
      }

      let selected: string[] | undefined;
      if (c.auxiliaryInfo) {
        try {
          const aux = JSON.parse(c.auxiliaryInfo);
          if (Array.isArray(aux.selectedMeanings)) selected = aux.selectedMeanings;
        } catch { }
      }

      return {
        text: c.simplified,
        reading: c.displayReading || '',
        meanings: meaningsArray,
        level: c.resolvedLevel || undefined,
        selectedMeanings: selected,
      };
    }),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Verifica si un texto corresponde al formato nativo de exportación Yomi.
 */
export function isYomiPackage(content: string): boolean {
  if (!content || !content.trim().startsWith('{')) return false;
  try {
    const obj = JSON.parse(content);
    return obj && obj.format === 'yomi-deck-v1';
  } catch {
    return false;
  }
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, '');
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLen);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const b0 = B64_LOOKUP[clean.charCodeAt(i)];
    const b1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const b2 = i + 2 < len ? B64_LOOKUP[clean.charCodeAt(i + 2)] : 64;
    const b3 = i + 3 < len ? B64_LOOKUP[clean.charCodeAt(i + 3)] : 64;

    bytes[p++] = (b0 << 2) | (b1 >> 4);
    if (b2 < 64 && p < byteLen) bytes[p++] = ((b1 & 15) << 4) | (b2 >> 2);
    if (b3 < 64 && p < byteLen) bytes[p++] = ((b2 & 3) << 6) | b3;
  }

  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS[b0 >> 2];
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
  }
  return result;
}

export interface AnkiPackageExtractResult {
  deckName: string;
  languageCode: string;
  deckType: 'language' | 'custom';
  items: ParsedVocabularyItem[];
  totalNotes: number;
}

/**
 * Descomprime un paquete nativo de Anki (.apkg), abre su base de datos SQLite
 * interna (collection.anki2) y extrae todas las notas con sus lecturas y significados.
 */
export async function extractAnkiPackageAsync(fileUri: string): Promise<AnkiPackageExtractResult> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const bytes = base64ToUint8Array(base64);
  const unzipped = unzipSync(bytes);

  const dbBytes = unzipped['collection.anki2'] || unzipped['collection.anki21'];
  if (!dbBytes) {
    throw new Error('El archivo .apkg no contiene una base de datos válida de Anki (collection.anki2).');
  }

  let ankiDb: SQLite.SQLiteDatabase | null = null;
  const tempDbName = `temp_anki_${Date.now()}`;
  let tempDbCreated = false;

  try {
    ankiDb = await SQLite.deserializeDatabaseAsync(dbBytes);
  } catch {
    // Fallback: guardar en carpeta de bases de datos de SQLite y abrir tradicionalmente
    tempDbCreated = true;
    const targetDir = SQLite.defaultDatabaseDirectory || `${FileSystem.documentDirectory}SQLite/`;
    const dirInfo = await FileSystem.getInfoAsync(targetDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
    }
    const tempDbPath = `${targetDir}${tempDbName}.db`;
    await FileSystem.writeAsStringAsync(tempDbPath, uint8ArrayToBase64(dbBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    ankiDb = await SQLite.openDatabaseAsync(`${tempDbName}.db`);
  }

  try {
    const colRows = await ankiDb.getAllAsync<{ decks: string; models: string }>(
      'SELECT decks, models FROM col LIMIT 1'
    );
    if (!colRows || colRows.length === 0) {
      throw new Error('La base de datos de Anki no contiene información de colección.');
    }

    const decks = JSON.parse(colRows[0].decks || '{}');
    const models = JSON.parse(colRows[0].models || '{}');

    const deckList = Object.values(decks) as Array<{ id: number; name: string }>;
    const namedDeck = deckList.find((d) => d.name !== 'Default') || deckList[0];
    const deckName = namedDeck ? namedDeck.name : 'Mazo Anki';

    const notes = await ankiDb.getAllAsync<{ id: number; mid: number; flds: string; tags: string }>(
      'SELECT id, mid, flds, tags FROM notes'
    );

    const items: ParsedVocabularyItem[] = [];
    let hasJapaneseChars = false;
    let hasChineseChars = false;

    for (const note of notes) {
      const model = models[note.mid];
      const fieldNames: string[] = model && Array.isArray(model.flds)
        ? model.flds.map((f: any) => String(f.name || '').toLowerCase().trim())
        : [];
      const fieldValues = (note.flds || '').split('\x1f').map(cleanHtmlAndAnkiTags);

      let text = '';
      let reading = '';
      let meaning = '';

      const kanjiIdx = fieldNames.findIndex((n) => /^(kanji|word|vocab|front|término|termino|palabra|expression|expr|hanzi)$/i.test(n));
      const onIdx = fieldNames.findIndex((n) => /^(ja_on|onyomi|on-yomi|on)$/i.test(n));
      const kunIdx = fieldNames.findIndex((n) => /^(ja_kun|kunyomi|kun-yomi|kun)$/i.test(n));
      const readingIdx = fieldNames.findIndex((n) => /^(furigana|reading|lectura|pinyin|kana|pronunciation|pronunciación)$/i.test(n));
      const meaningIdx = fieldNames.findIndex((n) => /^(meaning|meanings|definition|translation|significado|significados|back|glossary)$/i.test(n));
      const levelIdx = fieldNames.findIndex((n) => /^(level|jlpt|hsk|nivel)$/i.test(n));

      text = kanjiIdx >= 0 && fieldValues[kanjiIdx] ? fieldValues[kanjiIdx] : (fieldValues[0] || '');
      text = text.replace(/\[sound:[^\]]+\]/gi, '').trim();

      const furiganaParsed = parseAnkiFuriganaSyntax(text);
      if (furiganaParsed.reading) {
        text = furiganaParsed.text;
        reading = furiganaParsed.reading;
      }

      if (!reading) {
        if (onIdx >= 0 || kunIdx >= 0) {
          const rawOn = onIdx >= 0 ? fieldValues[onIdx] : '';
          const rawKun = kunIdx >= 0 ? fieldValues[kunIdx] : '';
          const cleanOn = rawOn.replace(/[・]/g, '').trim();
          const cleanKun = rawKun.replace(/[・]/g, '').trim();
          if (cleanOn && cleanKun) {
            reading = `On: ${cleanOn}  •  Kun: ${cleanKun}`;
          } else if (cleanOn) {
            reading = `On: ${cleanOn}`;
          } else if (cleanKun) {
            reading = `Kun: ${cleanKun}`;
          }
        } else if (readingIdx >= 0) {
          reading = fieldValues[readingIdx].replace(/[・]/g, '').trim();
        }
      }
      reading = reading.replace(/\[sound:[^\]]+\]/gi, '').replace(/[・]/g, '').trim();

      if (meaningIdx >= 0 && fieldValues[meaningIdx]) {
        meaning = fieldValues[meaningIdx];
      } else if (fieldValues.length > 1) {
        const fallbackIdx = fieldValues.findIndex(
          (val, idx) => idx !== kanjiIdx && idx !== onIdx && idx !== kunIdx && idx !== readingIdx && val.trim().length > 0
        );
        meaning = fallbackIdx >= 0 ? fieldValues[fallbackIdx] : '';
      }
      meaning = meaning.replace(/\[sound:[^\]]+\]/gi, '').trim();

      const splitMeanings = meaning
        .split(/[;\n\r\/]+/)
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text + reading)) {
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text + reading)) {
          hasJapaneseChars = true;
        } else {
          hasChineseChars = true;
        }
      }

      const levelVal = levelIdx >= 0 ? fieldValues[levelIdx] : undefined;

      if (text.length > 0) {
        items.push({
          text,
          reading: reading || undefined,
          meanings: splitMeanings.length > 0 ? splitMeanings : [meaning],
          level: levelVal || undefined,
        });
      }
    }

    let languageCode = 'ja-JP';
    let deckType: 'language' | 'custom' = 'language';

    if (hasJapaneseChars || /jlpt|kanji|n5|n4|n3|n2|n1/i.test(deckName)) {
      languageCode = 'ja-JP';
      deckType = 'language';
    } else if (hasChineseChars || /hsk|hanzi|pinyin/i.test(deckName)) {
      languageCode = 'zh-CN';
      deckType = 'language';
    } else {
      // Mazo genérico o personalizado (Preguntas y Respuestas, Medicina, Historia, etc.)
      languageCode = 'es-ES';
      deckType = 'custom';
    }

    // Si es un mazo personalizado (no ideográfico), asegurar que cada tarjeta conserve
    // la respuesta completa en el dorso (sin fragmentar por delimitadores de vocabulario)
    if (deckType === 'custom') {
      for (let i = 0; i < items.length; i++) {
        items[i].reading = undefined;
        if (items[i].meanings.length > 1) {
          items[i].meanings = [items[i].meanings.join('; ')];
        }
      }
    }

    return {
      deckName,
      languageCode,
      deckType,
      items,
      totalNotes: items.length,
    };
  } finally {
    if (ankiDb) {
      await ankiDb.closeAsync().catch(() => {});
    }
    if (tempDbCreated) {
      try {
        await SQLite.deleteDatabaseAsync(`${tempDbName}.db`);
      } catch {}
    }
  }
}

