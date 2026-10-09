import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarStyle, Spacing } from '../../constants/theme';
import { useTheme } from '../../../providers/ThemeProvider';

const KEEP_AWAKE_TAG = 'yomi_voice_review';

interface SessionLifecycleOptions {
  selectedDeckId: string | null;
  selectedDeckName: string;
  /** Repaso por voz en curso: mantiene la pantalla encendida. */
  isVoiceSessionActive: boolean;
  onExitSession: () => void;
  onAppBackground: () => void;
  onScreenBlur: () => void;
}

/**
 * Todo lo que rodea a la sesión de repaso pero no es el repaso en sí: encabezado, barra de
 * pestañas, botón atrás de Android, app en segundo plano, pérdida de foco y pantalla encendida.
 */
export function useSessionLifecycle({
  selectedDeckId,
  selectedDeckName,
  isVoiceSessionActive,
  onExitSession,
  onAppBackground,
  onScreenBlur,
}: SessionLifecycleOptions) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Las suscripciones viven toda la pantalla: siempre llaman a la versión más reciente de cada callback
  const callbacks = useRef({ onExitSession, onAppBackground, onScreenBlur });
  callbacks.current = { onExitSession, onAppBackground, onScreenBlur };

  // Ocultar la barra de pestañas durante la sesión
  useEffect(() => {
    const defaultTabBarStyle = getFloatingTabBarStyle(colors, insets.bottom);
    navigation.setOptions({ tabBarStyle: selectedDeckId ? { display: 'none' } : defaultTabBarStyle });
    return () => navigation.setOptions({ tabBarStyle: defaultTabBarStyle });
  }, [selectedDeckId, navigation, colors, insets.bottom]);

  // Botón atrás de Android: con una sesión abierta, salir de la sesión en lugar de navegar
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selectedDeckId) return false;
      callbacks.current.onExitSession();
      return true;
    });
    return () => sub.remove();
  }, [selectedDeckId]);

  // App en segundo plano (llamada, minimizar, bloquear). 'inactive' no cuenta: lo disparan diálogos del sistema.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') callbacks.current.onAppBackground();
    });
    return () => sub.remove();
  }, []);

  // Pantalla encendida solo durante el repaso por voz (manos libres)
  useEffect(() => {
    if (isVoiceSessionActive) activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else deactivateKeepAwake(KEEP_AWAKE_TAG);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [isVoiceSessionActive]);

  // Al salir de la pestaña
  useFocusEffect(
    useCallback(() => {
      return () => callbacks.current.onScreenBlur();
    }, [])
  );

  // Encabezado: flecha para salir de la sesión + nombre del mazo
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {selectedDeckId ? (
            <TouchableOpacity onPress={() => callbacks.current.onExitSession()} style={styles.headerBackBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.headerBrandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.headerBrandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.headerSubtitleText, { color: colors.text }]} numberOfLines={1}>
            {selectedDeckId ? selectedDeckName || 'Repaso' : 'Repaso SRS'}
          </Text>
        </View>
      ),
    });
  }, [selectedDeckId, selectedDeckName, colors]);
}

const styles = StyleSheet.create({
  headerBackBtn: {
    paddingRight: Spacing.xs,
    paddingVertical: 2,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBrandText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  headerBrandSep: {
    fontSize: 18,
    fontWeight: '600',
    flexShrink: 0,
  },
  headerSubtitleText: {
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
});
