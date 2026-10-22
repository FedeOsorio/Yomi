/**
 * Importación de mazos .apkg con su media, y recuperación de la media de un mazo ya importado.
 *
 * Es el único flujo de importación de Anki: lo usan la pantalla de importación y "Abrir con Yomi",
 * para que un arreglo hecho en uno no quede sin hacer en el otro.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { words } from '../db/schema';
import { AnkiMediaManifest, extractAnkiPackageAsync, importAnkiMediaAsync, ParsedVocabularyItem } from './anki-importer';
import { cleanOrphanMedia } from './data-repair';
import type { AnkiNoteType } from './anki-template';
import { addDeckAnkiDesign, getDeckAnkiDesign, setDeckMediaSource } from './deck-service';
import { listMediaFiles, mediaFileName } from './media-service';
import { MediaItem, parseAux } from './word-aux';
import { saveBatchAnkiCards, saveBatchWords, updateWordAux } from './word-service';

export interface AnkiDeckImportResult {
  deckId: string;
  inserted: number;
  skipped: number;
  mediaSaved: number;
  mediaFailed: number;
}

/**
 * Importa las tarjetas de un .apkg ya analizado con extractAnkiPackageAsync, junto con su media.
 * La media se extrae ANTES de crear el mazo (getDeckId), para no dejar un mazo vacío si la extracción falla.
 * Guarda también el diseño del mazo (plantillas, CSS y archivos que pide), para mostrar sus tarjetas como en Anki.
 */
export async function importAnkiDeckAsync({
  fileUri,
  fileName,
  items,
  mode = 'vocabulary',
  noteTypes,
  languageCode,
  manifest,
  getDeckId,
  onProgress,
}: {
  fileUri: string;
  /** Nombre del .apkg, para pedirlo al recuperar la media. */
  fileName: string;
  items: ParsedVocabularyItem[];
  /** 'anki': una tarjeta por tarjeta de Anki, mostrada con el diseño del mazo (ver extractAnkiPackageAsync) */
  mode?: 'vocabulary' | 'anki';
  noteTypes?: Record<string, AnkiNoteType>;
  /** Idioma del contenido detectado al importar (se guarda con el diseño del mazo) */
  languageCode?: string;
  manifest?: AnkiMediaManifest | null;
  getDeckId: () => Promise<string>;
  onProgress?: (done: number, total: number) => void;
}): Promise<AnkiDeckImportResult> {
  try {
    let mediaSaved = 0;
    let mediaFailed = 0;
    let mediaPaths = new Map<string, string>();

    if (manifest && manifest.byFile.size > 0) {
      const res = await importAnkiMediaAsync(fileUri, Array.from(manifest.byFile.keys()), manifest, onProgress);
      for (const m of items.flatMap((item) => item.media ?? [])) {
        const path = res.paths.get(m.file);
        if (path) {
          m.path = path;
        } else if (!manifest.byFile.has(m.file)) {
          m.missing = true; // nunca vino en el .apkg: no se puede recuperar
        }
      }
      mediaSaved = res.written + res.reused;
      mediaFailed = res.failed.length;
      mediaPaths = res.paths;
    }

    const deckId = await getDeckId();
    if (mediaSaved > 0) {
      await setDeckMediaSource(deckId, {
        file: fileName,
        mediaCount: mediaSaved,
        importedAt: new Date().toISOString(),
      }).catch((err) => console.warn('[AnkiImport] Error guardando mediaSource:', err));
    }

    if (noteTypes && Object.keys(noteTypes).length > 0) {
      const files: Record<string, string> = {};
      for (const name of manifest?.designFiles ?? []) {
        const path = mediaPaths.get(name);
        if (path) files[name] = path;
      }
      await addDeckAnkiDesign(deckId, { noteTypes, files, language: languageCode }).catch((err) =>
        console.warn('[AnkiImport] Error guardando el diseño del mazo:', err)
      );
    }

    const { inserted, skipped } =
      mode === 'anki' ? await saveBatchAnkiCards(deckId, items) : await saveBatchWords(deckId, items);
    return { deckId, inserted, skipped, mediaSaved, mediaFailed };
  } catch (err) {
    // Lo que se llegó a extraer quedó sin palabras que lo usen: a la papelera
    cleanOrphanMedia().catch(() => {});
    throw err;
  }
}

/** Asigna a cada referencia la ruta en la que quedó su archivo. Devuelve si cambió alguna. */
function applyMediaPaths(media: MediaItem[] | undefined, paths: Map<string, string>): boolean {
  let changed = false;
  for (const m of media ?? []) {
    const path = paths.get(m.file);
    if (path && m.path !== path) {
      m.path = path;
      m.missing = false;
      changed = true;
    }
  }
  return changed;
}

export type MediaRecoveryResult =
  | { status: 'noMediaInPackage' }
  | { status: 'noMatchingMedia' }
  | { status: 'recovered'; recovered: number; failed: number };

/**
 * Vuelve a extraer del .apkg original los archivos que le faltan a un mazo (p. ej. después de
 * restaurar un backup en otro teléfono). Escribe cada archivo en la ruta que ya tiene guardada la palabra.
 */
export async function recoverDeckMediaAsync(deckId: string, fileUri: string): Promise<MediaRecoveryResult> {
  const { mediaManifest } = await extractAnkiPackageAsync(fileUri);
  if (!mediaManifest || mediaManifest.byFile.size === 0) return { status: 'noMediaInPackage' };

  const deckWords = await db
    .select({ id: words.id, aux: words.auxiliaryInfo })
    .from(words)
    .where(eq(words.deckId, deckId));

  const onDisk = listMediaFiles();
  const toExtract = new Set<string>();
  const preferredPaths = new Map<string, string>();
  for (const w of deckWords) {
    for (const m of parseAux(w.aux).media ?? []) {
      const fileOnDisk = m.path ? mediaFileName(m.path) : m.file;
      if (onDisk.has(fileOnDisk) || !mediaManifest.byFile.has(m.file) || toExtract.has(m.file)) continue;
      toExtract.add(m.file);
      if (m.path) preferredPaths.set(m.file, m.path);
    }
  }

  // Archivos del diseño del mazo (CSS importado, imágenes de las plantillas), en la ruta que ya tenían
  const design = await getDeckAnkiDesign(deckId);
  for (const [name, path] of Object.entries(design?.files ?? {})) {
    if (onDisk.has(mediaFileName(path)) || !mediaManifest.byFile.has(name) || toExtract.has(name)) continue;
    toExtract.add(name);
    preferredPaths.set(name, path);
  }
  if (toExtract.size === 0) return { status: 'noMatchingMedia' };

  const res = await importAnkiMediaAsync(fileUri, Array.from(toExtract), mediaManifest, undefined, preferredPaths);

  for (const w of deckWords) {
    if (!applyMediaPaths(parseAux(w.aux).media, res.paths)) continue;
    await updateWordAux(w.id, (aux) => {
      applyMediaPaths(aux.media, res.paths);
    });
  }

  return { status: 'recovered', recovered: res.written + res.reused, failed: res.failed.length };
}
