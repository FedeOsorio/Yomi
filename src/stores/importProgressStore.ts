import { create } from 'zustand';

/**
 * Progreso de una importación que corre fuera de una pantalla ("Abrir con Yomi").
 * Lo muestra ImportProgressOverlay, montado en el layout raíz.
 */
export interface ImportProgress {
  deckName: string;
  /** Archivos de media extraídos / total. total = 0 si el mazo no trae media. */
  done: number;
  total: number;
  /** Texto fijo en lugar del progreso de importación (p. ej. "Eliminando mazo…"). */
  message?: string;
}

interface ImportProgressState {
  progress: ImportProgress | null;
  start: (deckName: string, total: number, message?: string) => void;
  update: (done: number, total: number) => void;
  finish: () => void;
}

export const useImportProgressStore = create<ImportProgressState>((set, get) => ({
  progress: null,
  start: (deckName, total, message) => set({ progress: { deckName, done: 0, total, message } }),
  update: (done, total) => {
    const current = get().progress;
    if (current) set({ progress: { ...current, done, total } });
  },
  finish: () => set({ progress: null }),
}));
