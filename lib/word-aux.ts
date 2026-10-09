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

  /** Campos extra que trae un mazo importado de Anki: se conservan tal cual. */
  [extra: string]: unknown;
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
