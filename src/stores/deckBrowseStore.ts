import { create } from 'zustand';

/** Lo que el listado del mazo ya tiene cargado: el detalle lo muestra enseguida, sin esperar la base. */
export interface BrowsePreview {
  /** Fila del mazo */
  deck: unknown;
  /** Filas de las palabras (por id), tal como las tiene el listado */
  words: Map<string, unknown>;
}

// Orden de palabras que el usuario veía en el listado del mazo (respetando la búsqueda activa).
// El detalle de palabra lo usa para deslizar a la anterior / siguiente.
interface DeckBrowseState {
  deckId: string | null;
  wordIds: string[];
  preview: BrowsePreview | null;
  setBrowseList: (deckId: string, wordIds: string[], preview?: BrowsePreview) => void;
}

export const useDeckBrowseStore = create<DeckBrowseState>((set) => ({
  deckId: null,
  wordIds: [],
  preview: null,
  setBrowseList: (deckId, wordIds, preview) => set({ deckId, wordIds, preview: preview ?? null }),
}));
