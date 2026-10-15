import { create } from 'zustand';

// Orden de palabras que el usuario veía en el listado del mazo (respetando la búsqueda activa).
// El detalle de palabra lo usa para deslizar a la anterior / siguiente.
interface DeckBrowseState {
  deckId: string | null;
  wordIds: string[];
  setBrowseList: (deckId: string, wordIds: string[]) => void;
}

export const useDeckBrowseStore = create<DeckBrowseState>((set) => ({
  deckId: null,
  wordIds: [],
  setBrowseList: (deckId, wordIds) => set({ deckId, wordIds }),
}));
