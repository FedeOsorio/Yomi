/**
 * Datos extra de una palabra, guardados como JSON en `words.auxiliary_info`.
 * Este es el ÚNICO lugar que sabe leerlos y escribirlos: el resto de la app usa
 * parseAux / stringifyAux (y updateWordAux, en word-service) en vez de JSON.parse y JSON.stringify sueltos.
 */
export interface WordAux {
  /** Nivel JLPT / HSK (p. ej. "N5"). */
  level?: string;
  /** Categoría gramatical (p. ej. "Verbo Godan (-u)", "Sustantivo"). */
  category?: string;

  /** Significados elegidos por el usuario (los que se evalúan y se muestran). */
  selectedMeanings?: string[];

  /** Lecturas de un kanji suelto. */
  kanjiReadings?: string;
  onReading?: string;
  kunReading?: string;

  /** Práctica de conjugaciones. */
  conjugationEnabled?: boolean;
  disabledConjugations?: string[];
  conjugationStreaks?: Record<string, number>;
  dictionaryForm?: { kanji: string; reading: string };

  /** Archivos multimedia asociados a la tarjeta (audio, video, imagen). */
  media?: MediaItem[];

  /** Tarjeta importada de Anki: con esto el visor la dibuja con el diseño del mazo (ver anki-template). */
  anki?: AnkiCardRef;

  /** Campos extra que trae un mazo importado de Anki: se conservan tal cual. */
  [extra: string]: unknown;
}

export interface AnkiCardRef {
  /** id de la nota en Anki (para no duplicar al reimportar) */
  noteId: number;
  /** tipo de nota (clave de decks.ankiNoteTypes) */
  mid: number;
  /** plantilla (o número de cloze - 1) de la tarjeta */
  ord: number;
  /** campos originales de la nota, con su HTML */
  fields: string[];
  tags?: string[];
}

export interface MediaItem {
  file: string;                     // Nombre real: "neko.mp3", "clip.mp4", "diagrama.png"
  path?: string;                    // Ruta relativa en disco: "media/neko.mp3" (asignada tras extraer)
  kind: 'audio' | 'video' | 'image';
  side: 'front' | 'back';
  role?: 'prompt' | 'word' | 'sentence';
  missing?: boolean;                // Marcado si nunca vino en el .apkg original
}

/** La palabra viene de una nota de Anki (se puede dibujar con el diseño del mazo). Sin parsear el JSON. */
export function hasAnkiCardRef(raw?: string | null): boolean {
  return Boolean(raw?.includes('"anki":'));
}

/** Lee el JSON de una palabra. Nunca lanza: si está vacío o roto devuelve {}. */
export function parseAux(raw?: string | null): WordAux {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Serializa para guardar. Devuelve null si no hay ningún dato (la columna queda vacía). */
export function stringifyAux(aux: WordAux): string | null {
  return Object.keys(aux).length > 0 ? JSON.stringify(aux) : null;
}
