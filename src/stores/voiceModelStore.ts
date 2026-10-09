import { create } from 'zustand';
import { sherpaVoiceService } from '../../lib/sherpa-service';

/**
 * Estado de la descarga del modelo de reconocimiento de voz offline.
 * Vive en un store para que el progreso se mantenga aunque el usuario cambie de pantalla.
 */
type Status = 'unknown' | 'missing' | 'downloading' | 'ready';

interface VoiceModelState {
  status: Status;
  percent: number;
  refresh: () => Promise<void>;
  download: () => Promise<boolean>;
  remove: () => Promise<void>;
}

export const useVoiceModelStore = create<VoiceModelState>((set, get) => ({
  status: 'unknown',
  percent: 0,

  refresh: async () => {
    if (get().status === 'downloading') return;
    set({ status: (await sherpaVoiceService.isModelDownloaded()) ? 'ready' : 'missing' });
  },

  download: async () => {
    if (get().status === 'downloading') return false;
    set({ status: 'downloading', percent: 0 });
    const ok = await sherpaVoiceService.downloadModel((percent) => set({ percent }));
    set({ status: ok ? 'ready' : 'missing', percent: ok ? 100 : 0 });
    return ok;
  },

  remove: async () => {
    await sherpaVoiceService.deleteModel();
    set({ status: 'missing', percent: 0 });
  },
}));
