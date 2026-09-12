import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const SETTINGS_FILE = (FileSystem.documentDirectory || '') + 'yomi_app_storage.json';

let memoryCache: Record<string, string> = {};
let isLoaded = false;

async function ensureLoaded() {
  if (isLoaded) return;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) memoryCache[k] = window.localStorage.getItem(k) || '';
        }
      }
    } else {
      const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
        memoryCache = JSON.parse(content) || {};
      }
    }
  } catch (e) {
    console.warn('Storage init warning:', e);
  }
  isLoaded = true;
}

export async function getStorageItem(key: string): Promise<string | null> {
  await ensureLoaded();
  return memoryCache[key] ?? null;
}

export function getStorageItemSync(key: string): string | null {
  return memoryCache[key] ?? null;
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  await ensureLoaded();
  memoryCache[key] = value;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } else {
      await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(memoryCache));
    }
  } catch (e) {
    console.warn('Storage save warning:', e);
  }
}

export async function removeStorageItem(key: string): Promise<void> {
  await ensureLoaded();
  delete memoryCache[key];
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(memoryCache));
    }
  } catch (e) {
    console.warn('Storage delete warning:', e);
  }
}
