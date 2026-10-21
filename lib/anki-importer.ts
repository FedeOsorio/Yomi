/**
 * Módulo desacoplado para análisis (parsing) y transformación de archivos exportados
 * desde Anki, CSV, TSV y texto plano hacia estructuras de datos universales de vocabulario.
 *
 * Este servicio NO depende de la UI ni de frameworks de presentación para garantizar
 * máxima escalabilidad, testabilidad y reutilización en cualquier entorno.
 */

import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { getKanjiEssentialReading } from './jlpt-data';
import {
  deleteFileQuietly,
  getMediaDir,
  getMediaKind,
  MEDIA_PLACEHOLDERS,
  MediaKind,
  mediaFileName,
  mediaPath,
  sanitizeMediaName,
} from './media-service';
import { parseAux, MediaItem } from './word-aux';
import { openZip, ZipEntry } from './zip-reader';

export interface RawImportRow {
  [key: string]: string;
}

export interface ParsedVocabularyItem {
  text: string;
  reading?: string;
  meanings: string[];
  level?: string;
  rawExtras?: Record<string, string>;
  media?: MediaItem[];
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
 * Enriquece un ítem de vocabulario con la lectura esencial canónica (especialmente para Kanjis N5/N4)
 * y preserva el desglose On/Kun en rawExtras.
 */
function enrichVocabularyItem(
  mainText: string,
  reading: string,
  meanings: string[],
  level?: string,
  extras?: Record<string, string>,
  media?: MediaItem[]
): ParsedVocabularyItem {
  const cleanMain = mainText.trim();
  const isSingleKanji = cleanMain.length === 1 && /[\u4e00-\u9faf]/.test(cleanMain);
  let finalReading = reading.trim();
  const rawExtras: Record<string, string> = { ...(extras || {}) };

  if (isSingleKanji) {
    let rawOn = rawExtras.onReading || '';
    let rawKun = rawExtras.kunReading || '';
    if (!rawOn && !rawKun && (finalReading.includes('/') || /\b(on|kun)\b/i.test(finalReading) || finalReading.includes('•'))) {
      const parts = finalReading.split(/[\/•]/).map((p) => p.trim());
      parts.forEach((p) => {
        if (/^on[:：\s]/i.test(p) || /^[\u30a0-\u30ff\s,、]+$/.test(p)) {
          rawOn = p.replace(/^on[:：\s]*/i, '').trim();
        } else if (/^kun[:：\s]/i.test(p) || /^[\u3040-\u309f\s,、\-\~]+$/.test(p)) {
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

  dataRows.forEach((row) => {
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

    items.push(enrichVocabularyItem(mainText, reading, meanings, cleanHtmlAndAnkiTags(rawLevel)));
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

    const meanings = splitMeanings.length > 0 ? splitMeanings : [cleanMeaningStr];

    items.push(enrichVocabularyItem(mainText, reading, meanings, cleanHtmlAndAnkiTags(rawLevel)));
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

      const aux = parseAux(c.auxiliaryInfo);
      const auxSelected = aux.selectedMeanings;
      const selected: string[] | undefined = Array.isArray(auxSelected) ? auxSelected : undefined;

      return {
        text: c.simplified,
        reading: c.displayReading || '',
        meanings: meaningsArray,
        level: c.resolvedLevel || undefined,
        selectedMeanings: selected,
        media: aux.media,
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

/**
 * Extrae referencias a archivos multimedia (audio, video, imagen) desde el contenido crudo
 * de un campo HTML de Anki antes de remover las etiquetas.
 */
export function extractMediaFromField(
  rawField: string,
  fieldName: string,
  isFront: boolean
): MediaItem[] {
  if (!rawField) return [];
  const results: MediaItem[] = [];
  const seen = new Set<string>();
  const isSentence = /sentence|example|ejemplo|例文|phrase|oración|oracion/i.test(fieldName);
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

    results.push({
      file: clean,
      kind,
      side: isFront ? 'front' : 'back',
      role,
    });
  };

  // 1. [sound:archivo.mp3]
  const soundMatches = rawField.matchAll(/\[sound:([^\]]+)\]/gi);
  for (const m of soundMatches) {
    addMediaFile(m[1] || '');
  }

  // 2. <audio src="..."> o <video src="...">
  const tagMediaMatches = rawField.matchAll(/<(audio|video)[^>]+src=["']([^"']+)["'][^>]*>/gi);
  for (const m of tagMediaMatches) {
    addMediaFile(m[2] || '');
  }

  // 3. <img src="...">
  const imgMatches = rawField.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
  for (const m of imgMatches) {
    addMediaFile(m[1] || '');
  }

  return results;
}

export interface AnkiMediaManifest {
  byFile: Map<string, ZipEntry>;
  audioCount: number;
  videoCount: number;
  imageCount: number;
  totalBytes: number;
  missing: string[];
}

export interface AnkiPackageExtractResult {
  deckName: string;
  languageCode: string;
  deckType: 'language' | 'custom';
  items: ParsedVocabularyItem[];
  totalNotes: number;
  mediaManifest?: AnkiMediaManifest;
}

/**
 * Descomprime un paquete nativo de Anki (.apkg) por bloques utilizando FileHandle,
 * abre su base de datos interna y extrae notas junto con su manifiesto de media.
 */
export async function extractAnkiPackageAsync(fileUri: string): Promise<AnkiPackageExtractResult> {
  const reader = openZip(fileUri);
  let ankiDb: SQLite.SQLiteDatabase | null = null;
  const tempDbName = `temp_anki_${Date.now()}`;
  let tempDbCreated = false;

  try {
    // Exportaciones zstd de Anki 2.1.50+: el collection.anki2 que traen es sólo una nota de relleno
    if (reader.hasEntry('collection.anki21b') && !reader.hasEntry('collection.anki21')) {
      throw new Error(
        'Este mazo fue exportado con el nuevo formato comprimido de Anki (anki21b/zstd). ' +
        'Para importarlo en Yomi, al exportar desde Anki marcá la casilla "Support older Anki versions" (compatibilidad con versiones anteriores).'
      );
    }

    const dbEntry = reader.getEntry('collection.anki21') || reader.getEntry('collection.anki2');
    if (!dbEntry) {
      throw new Error('El archivo .apkg no contiene una base de datos válida de Anki (collection.anki2).');
    }

    const dbBytes = reader.readEntry(dbEntry);

    try {
      ankiDb = await SQLite.deserializeDatabaseAsync(dbBytes);
    } catch {
      tempDbCreated = true;
      const targetDir = SQLite.defaultDatabaseDirectory || `${FileSystem.documentDirectory}SQLite/`;
      const dirInfo = await FileSystem.getInfoAsync(targetDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      }
      const tempFile = new File(`${targetDir}${tempDbName}.db`);
      if (tempFile.exists) tempFile.delete();
      tempFile.write(dbBytes);
      ankiDb = await SQLite.openDatabaseAsync(`${tempDbName}.db`);
    }

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

    // Mapeo de media Anki: {"0": "neko.mp3", "1": "clip.mp4"} -> Map<nombreReal, entradaZip>
    const mediaNameToZipKey = new Map<string, string>();
    if (reader.hasEntry('media')) {
      try {
        const mediaEntry = reader.getEntry('media')!;
        const mediaJsonStr = new TextDecoder('utf-8').decode(reader.readEntry(mediaEntry));
        const mediaMap = JSON.parse(mediaJsonStr);
        for (const [zipKey, realName] of Object.entries(mediaMap)) {
          if (typeof realName === 'string') {
            const clean = realName.trim().normalize('NFC');
            mediaNameToZipKey.set(clean, zipKey);
            mediaNameToZipKey.set(clean.toLowerCase(), zipKey);
          }
        }
      } catch (e) {
        console.warn('[AnkiImporter] Error al parsear media map:', e);
      }
    }

    const items: ParsedVocabularyItem[] = [];
    const referencedMediaFiles = new Map<string, MediaKind>();
    let hasJapaneseChars = false;
    let hasChineseChars = false;

    for (const note of notes) {
      const model = models[note.mid];
      const fieldNames: string[] = model && Array.isArray(model.flds)
        ? model.flds.map((f: any) => String(f.name || '').toLowerCase().trim())
        : [];
      const rawFieldValues = (note.flds || '').split('\x1f');
      const cleanFieldValues = rawFieldValues.map(cleanHtmlAndAnkiTags);

      const kanjiIdx = fieldNames.findIndex((n) => /^(kanji|word|vocab|front|término|termino|palabra|expression|expr|hanzi|question|pregunta)$/i.test(n));
      const onIdx = fieldNames.findIndex((n) => /^(ja_on|onyomi|on-yomi|on)$/i.test(n));
      const kunIdx = fieldNames.findIndex((n) => /^(ja_kun|kunyomi|kun-yomi|kun)$/i.test(n));
      const readingIdx = fieldNames.findIndex((n) => /^(furigana|reading|lectura|pinyin|kana|pronunciation|pronunciación)$/i.test(n));
      const meaningIdx = fieldNames.findIndex((n) => /^(meaning|meanings|definition|translation|significado|significados|back|glossary|answer|respuesta)$/i.test(n));
      const levelIdx = fieldNames.findIndex((n) => /^(level|jlpt|hsk|nivel)$/i.test(n));

      // Extraer media de todos los campos antes de que los tags se pierdan
      const noteMedia = rawFieldValues.flatMap((rawFld, fIdx) =>
        extractMediaFromField(
          rawFld,
          fieldNames[fIdx] || `field_${fIdx}`,
          fIdx === kanjiIdx || (kanjiIdx < 0 && fIdx === 0)
        )
      );
      for (const m of noteMedia) referencedMediaFiles.set(m.file, m.kind);

      // (los campos limpios ya no traen [sound:...]: cleanHtmlAndAnkiTags los quita)
      let text = kanjiIdx >= 0 && cleanFieldValues[kanjiIdx] ? cleanFieldValues[kanjiIdx] : (cleanFieldValues[0] || '');

      // Si el frente sólo contenía media (sin texto), usar placeholder descriptivo para no descartar la tarjeta
      const firstFrontMedia = noteMedia.find((m) => m.side === 'front');
      if (text.length === 0 && firstFrontMedia) {
        text = MEDIA_PLACEHOLDERS[firstFrontMedia.kind];
      }

      let reading = '';
      let meaning = '';

      const furiganaParsed = parseAnkiFuriganaSyntax(text);
      if (furiganaParsed.reading) {
        text = furiganaParsed.text;
        reading = furiganaParsed.reading;
      }

      const rawOn = onIdx >= 0 ? cleanFieldValues[onIdx] : '';
      const rawKun = kunIdx >= 0 ? cleanFieldValues[kunIdx] : '';

      if (!reading) {
        if (onIdx >= 0 || kunIdx >= 0) {
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
          reading = cleanFieldValues[readingIdx].replace(/[・]/g, '').trim();
        }
      }
      reading = reading.replace(/[・]/g, '').trim();

      if (meaningIdx >= 0 && cleanFieldValues[meaningIdx]) {
        meaning = cleanFieldValues[meaningIdx];
      } else if (cleanFieldValues.length > 1) {
        const fallbackIdx = cleanFieldValues.findIndex(
          (val, idx) => idx !== kanjiIdx && idx !== onIdx && idx !== kunIdx && idx !== readingIdx && val.trim().length > 0
        );
        meaning = fallbackIdx >= 0 ? cleanFieldValues[fallbackIdx] : '';
      }

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

      const levelVal = levelIdx >= 0 ? cleanFieldValues[levelIdx] : undefined;

      if (text.length > 0) {
        items.push(
          enrichVocabularyItem(
            text,
            reading,
            splitMeanings.length > 0 ? splitMeanings : [meaning],
            levelVal,
            {
              ...(rawOn ? { onReading: rawOn.replace(/[・]/g, '').trim() } : {}),
              ...(rawKun ? { kunReading: rawKun.replace(/[・]/g, '').trim() } : {}),
            },
            noteMedia
          )
        );
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
      languageCode = 'es-ES';
      deckType = 'custom';
    }

    if (deckType === 'custom') {
      for (let i = 0; i < items.length; i++) {
        items[i].reading = undefined;
        if (items[i].meanings.length > 1) {
          items[i].meanings = [items[i].meanings.join('; ')];
        }
      }
    }

    // Construir manifiesto de media
    const byFile = new Map<string, ZipEntry>();
    const missing: string[] = [];
    const counts: Record<MediaKind, number> = { audio: 0, video: 0, image: 0 };
    let totalBytes = 0;

    for (const [fileName, kind] of referencedMediaFiles) {
      const zipKey = mediaNameToZipKey.get(fileName) || mediaNameToZipKey.get(fileName.toLowerCase()) || fileName;
      const entry = reader.getEntry(zipKey);
      if (entry) {
        byFile.set(fileName, entry);
        counts[kind]++;
        totalBytes += entry.size;
      } else {
        missing.push(fileName);
      }
    }

    const mediaManifest: AnkiMediaManifest = {
      byFile,
      audioCount: counts.audio,
      videoCount: counts.video,
      imageCount: counts.image,
      totalBytes,
      missing,
    };

    return {
      deckName,
      languageCode,
      deckType,
      items,
      totalNotes: items.length,
      mediaManifest,
    };
  } finally {
    reader.close();
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

/** Espacio libre mínimo para empezar a extraer media. */
const MIN_FREE_BYTES = 50 * 1024 * 1024;

/** "neko.mp3" + "a1b2c3d4…" -> "neko-a1b2c3d4.mp3" */
function withHashSuffix(fileName: string, md5: string | null): string {
  const hash8 = (md5 || String(Date.now())).slice(0, 8);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)}-${hash8}${fileName.slice(dot)}` : `${fileName}-${hash8}`;
}

/**
 * Extrae archivos multimedia de un paquete .apkg hacia el almacenamiento local (Paths.document/media),
 * deduplicando por contenido (MD5) y reportando el progreso periódicamente.
 *
 * Cada archivo se extrae primero a la caché y después:
 * - si el destino no existe, se mueve ahí;
 * - si existe con el mismo contenido, se reutiliza;
 * - si existe con otro contenido, se guarda como `nombre-<md5>.ext` (siempre el mismo nombre para el mismo archivo).
 *
 * `preferredPaths` (al recuperar) indica la ruta que ya tiene guardada cada palabra, para escribir exactamente ahí.
 */
export async function importAnkiMediaAsync(
  fileUri: string,
  filesToExtract: string[],
  manifest: Map<string, ZipEntry>,
  onProgress?: (done: number, total: number) => void,
  preferredPaths?: Map<string, string>
): Promise<{ paths: Map<string, string>; written: number; reused: number; failed: string[] }> {
  let freeBytes = 0;
  try {
    freeBytes = Paths.availableDiskSpace;
  } catch {}
  if (freeBytes > 0 && freeBytes < MIN_FREE_BYTES) {
    throw new Error('Espacio de almacenamiento insuficiente en el dispositivo.');
  }

  const mediaDir = getMediaDir();
  const paths = new Map<string, string>();
  const failed: string[] = [];
  let written = 0;
  let reused = 0;

  const reader = openZip(fileUri);
  try {
    const total = filesToExtract.length;
    for (let i = 0; i < total; i++) {
      const fileName = filesToExtract[i];
      const entry = manifest.get(fileName);
      const preferredPath = preferredPaths?.get(fileName);
      const targetName = preferredPath ? mediaFileName(preferredPath) : sanitizeMediaName(fileName);
      const temp = new File(Paths.cache, `media_import_${Date.now()}_${i}`);
      const tempUri = temp.uri; // moveSync actualiza temp.uri al destino

      try {
        if (!entry) throw new Error('No está en el paquete');
        reader.extractEntryToFile(entry, temp);

        const dest = new File(mediaDir, targetName);
        if (!dest.exists) {
          temp.moveSync(dest);
          paths.set(fileName, mediaPath(targetName));
          written++;
        } else if (dest.md5 && temp.md5 && dest.md5.toLowerCase() === temp.md5.toLowerCase()) {
          temp.delete();
          paths.set(fileName, mediaPath(targetName));
          reused++;
        } else {
          const uniqueName = withHashSuffix(targetName, temp.md5);
          temp.moveSync(new File(mediaDir, uniqueName), { overwrite: true });
          paths.set(fileName, mediaPath(uniqueName));
          written++;
        }
      } catch (err) {
        console.warn(`[AnkiImporter] Error al extraer media ${fileName}:`, err);
        deleteFileQuietly(tempUri);
        failed.push(fileName);
      }

      if ((i + 1) % 20 === 0 || i === total - 1) {
        onProgress?.(i + 1, total);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  } finally {
    reader.close();
  }

  return { paths, written, reused, failed };
}
