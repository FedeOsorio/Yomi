import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
  const systemColorScheme = useColorScheme();
  const defaultTheme: ThemeMode = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [themeMode, setThemeModeState] = useState<ThemeMode>(defaultTheme);

  // Cargar preferencia persistente al iniciar la app (vía Storage).
  // Si no hay preferencia guardada previamente, se respeta el tema del sistema del usuario.
  useEffect(() => {
    let isMounted = true;
    async function loadTheme() {
      const saved = await getStorageItem('yomi_theme_mode');
      if (isMounted) {
        if (saved === 'light' || saved === 'dark') {
          setThemeModeState(saved as ThemeMode);
        } else {
          // Si nunca guardó una preferencia, asegurar que tome el esquema del sistema
          setThemeModeState(systemColorScheme === 'dark' ? 'dark' : 'light');
        }
      }
    }
    loadTheme();
    return () => {
      isMounted = false;
    };
  }, [systemColorScheme]);

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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
