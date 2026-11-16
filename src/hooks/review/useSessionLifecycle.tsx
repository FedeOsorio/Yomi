import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarStyle, Spacing } from '../../constants/theme';
import { useTheme } from '../../../providers/ThemeProvider';

interface SessionLifecycleOptions {
  selectedDeckId: string | null;
  selectedDeckName: string;
  onExitSession: () => void;
}

/**
 * Todo lo que rodea a la sesión de repaso pero no es el repaso en sí: encabezado, barra de
 * pestañas y botón atrás de Android.
 */
export function useSessionLifecycle({ selectedDeckId, selectedDeckName, onExitSession }: SessionLifecycleOptions) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Las suscripciones viven toda la pantalla: siempre llaman a la versión más reciente
  const callbacks = useRef({ onExitSession });
  callbacks.current = { onExitSession };

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
