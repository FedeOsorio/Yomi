import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation as useReactI18next } from 'react-i18next';
import { es } from './locales/es';
import { en } from './locales/en';
import { pt } from './locales/pt';
import { ja } from './locales/ja';
import { SupportedLanguage } from './types';
import { getStorageItem, setStorageItem } from '../../lib/storage-service';
import { create } from 'zustand';

export const resources = {
  es: { translation: es },
  en: { translation: en },
  pt: { translation: pt },
  ja: { translation: ja },
} as const;

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const code = locales[0].languageCode?.toLowerCase();
      if (code?.startsWith('es')) return 'es';
      if (code?.startsWith('pt')) return 'pt';
      if (code?.startsWith('ja')) return 'ja';
      if (code?.startsWith('en')) return 'en';
    }
  } catch (e) {
    console.warn('Error reading device locale:', e);
  }
  return 'es';
}

const LANGUAGE_STORAGE_KEY = 'yomi_user_app_language';
const initialDeviceLang = getDeviceLanguage();

export type LanguagePreference = 'system' | SupportedLanguage;

interface LanguageStoreState {
  currentLanguage: SupportedLanguage;
  preference: LanguagePreference;
  setLanguagePreference: (pref: LanguagePreference) => Promise<void>;
  syncLanguage: (current: SupportedLanguage, pref: LanguagePreference) => void;
}

export const useLanguageStore = create<LanguageStoreState>((set) => ({
  currentLanguage: initialDeviceLang,
  preference: 'system',
  setLanguagePreference: async (pref: LanguagePreference) => {
    const effectiveLang = pref === 'system' ? getDeviceLanguage() : pref;
    await i18n.changeLanguage(effectiveLang);
    await setStorageItem(LANGUAGE_STORAGE_KEY, pref);
    set({ currentLanguage: effectiveLang, preference: pref });
  },
  syncLanguage: (current, pref) => set({ currentLanguage: current, preference: pref }),
}));

i18n.use(initReactI18next).init({
  resources,
  lng: initialDeviceLang,
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: 'v4',
});

// Cargar preferencia guardada de forma asíncrona al iniciar
(async () => {
  try {
    const saved = await getStorageItem(LANGUAGE_STORAGE_KEY);
    if (saved && saved !== 'system') {
      const typedSaved = saved as SupportedLanguage;
      await i18n.changeLanguage(typedSaved);
      useLanguageStore.getState().syncLanguage(typedSaved, typedSaved);
    } else {
      const devLang = getDeviceLanguage();
      await i18n.changeLanguage(devLang);
      useLanguageStore.getState().syncLanguage(devLang, 'system');
    }
  } catch (e) {
    console.warn('Error loading saved language preference:', e);
  }
})();

export function getCurrentUserLanguage(): SupportedLanguage {
  return useLanguageStore.getState().currentLanguage || getDeviceLanguage();
}

export { useReactI18next as useTranslation };
export default i18n;
