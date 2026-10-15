import { create } from 'zustand';
import { sherpaVoiceService, VOICE_MODEL_IDS, VoiceModelId } from '../../lib/sherpa-service';

/**
 * Estado de los modelos de reconocimiento de voz offline (uno por idioma).
 * Vive en un store para que el progreso de descarga se mantenga aunque el usuario cambie de pantalla.
 */
type Status = 'unknown' | 'missing' | 'downloading' | 'ready';
export interface ModelState {
  status: Status;
  percent: number;
}

interface VoiceModelState {
  models: Record<VoiceModelId, ModelState>;
  refresh: () => Promise<void>;
  download: (id: VoiceModelId) => Promise<boolean>;
  remove: (id: VoiceModelId) => Promise<void>;
}

const initial = Object.fromEntries(VOICE_MODEL_IDS.map((id) => [id, { status: 'unknown', percent: 0 }])) as Record<
  VoiceModelId,
  ModelState
>;

export const useVoiceModelStore = create<VoiceModelState>((set, get) => {
  const update = (id: VoiceModelId, state: Partial<ModelState>) =>
    set({ models: { ...get().models, [id]: { ...get().models[id], ...state } } });

  return {
    models: initial,

    refresh: async () => {
      for (const id of VOICE_MODEL_IDS) {
        if (get().models[id].status === 'downloading') continue;
        update(id, { status: (await sherpaVoiceService.isModelDownloaded(id)) ? 'ready' : 'missing' });
      }
    },

    download: async (id) => {
      if (get().models[id].status === 'downloading') return false;
      update(id, { status: 'downloading', percent: 0 });
      const ok = await sherpaVoiceService.downloadModel(id, (percent) => update(id, { percent }));
      update(id, { status: ok ? 'ready' : 'missing', percent: ok ? 100 : 0 });
      return ok;
    },

    remove: async (id) => {
      await sherpaVoiceService.deleteModel(id);
      update(id, { status: 'missing', percent: 0 });
    },
  };
});
