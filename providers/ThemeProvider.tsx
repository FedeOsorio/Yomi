import React, { createContext, useContext, useState, useEffect } from 'react';
import { DarkColors, LightColors } from '../src/constants/theme';
import { getStorageItem, setStorageItem } from '../lib/storage-service';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  isDark: boolean;
  themeMode: ThemeMode;
  colors: typeof DarkColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  themeMode: 'dark',
  colors: DarkColors,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  // Cargar preferencia persistente al iniciar la app (vía FileSystem de Expo / Storage)
  useEffect(() => {
    let isMounted = true;
    async function loadTheme() {
      const saved = await getStorageItem('yomi_theme_mode');
      if (isMounted && (saved === 'light' || saved === 'dark')) {
        setThemeModeState(saved as ThemeMode);
      }
    }
    loadTheme();
    return () => {
      isMounted = false;
    };
  }, []);

  const isDark = themeMode === 'dark';
  const colors = isDark ? DarkColors : LightColors;

  const toggleTheme = () => {
    setThemeModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setStorageItem('yomi_theme_mode', next);
      return next;
    });
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    setStorageItem('yomi_theme_mode', mode);
  };

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, colors, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
