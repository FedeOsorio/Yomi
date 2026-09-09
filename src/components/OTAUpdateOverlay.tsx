import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from 'react-native-reanimated';

export function OTAUpdateOverlay() {
  // En entorno web o desarrollo local no se aplican actualizaciones OTA
  if (Platform.OS === 'web' || __DEV__) return null;

  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [isUpdating, setIsUpdating] = useState(false);

  // Ventana de arranque: solo forzar actualización si se detecta dentro de los primeros 12 segundos
  const isStartupRef = useRef(true);
  const overlayStartTime = useRef(0);
  const opacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      isStartupRef.current = false;
    }, 12000);
    return () => clearTimeout(timeout);
  }, []);

  // Animación de pulso sutil del icono de Yomi
  useEffect(() => {
    if (isUpdating) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [isUpdating]);

  // 1. Chequeo directo al arrancar la app
  useEffect(() => {
    let isMounted = true;

    async function checkDirectly() {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable && isStartupRef.current && !isUpdating) {
          if (isMounted) {
            setIsUpdating(true);
            overlayStartTime.current = Date.now();
            opacity.value = withTiming(1, { duration: 400 });
          }

          await Updates.fetchUpdateAsync();
          const timeElapsed = Date.now() - overlayStartTime.current;
          const timeRemaining = Math.max(0, 1800 - timeElapsed);

          setTimeout(async () => {
            await Updates.reloadAsync();
          }, timeRemaining);
        }
      } catch (e) {
        // En caso de modo offline o servidor temporalmente inaccesible
      }
    }

    checkDirectly();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Listener reactivo por si useUpdates() emite evento de actualización disponible
  useEffect(() => {
    if (isUpdateAvailable && isStartupRef.current && !isUpdating) {
      setIsUpdating(true);
      overlayStartTime.current = Date.now();
      opacity.value = withTiming(1, { duration: 400 });
      Updates.fetchUpdateAsync().catch(console.error);
    }
  }, [isUpdateAvailable]);

  // 3. Cuando la descarga finaliza y queda pendiente el reinicio
  useEffect(() => {
    if (isUpdatePending && isUpdating) {
      const timeElapsed = Date.now() - overlayStartTime.current;
      const timeRemaining = Math.max(0, 1800 - timeElapsed);

      setTimeout(() => {
        Updates.reloadAsync().catch(console.error);
      }, timeRemaining);
    }
  }, [isUpdatePending, isUpdating]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  if (!isUpdating) return null;

  return (
    <Animated.View style={[styles.overlay, containerAnimatedStyle]}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconCircle, iconAnimatedStyle]}>
          <Ionicons name="sparkles" size={38} color="#3B82F6" />
        </Animated.View>
        <ActivityIndicator size="large" color="#3B82F6" style={styles.spinner} />
        <Text style={styles.title}>Actualizando Yomi...</Text>
        <Text style={styles.subtitle}>
          Descargando la última versión.{'\n'}La aplicación se reiniciará automáticamente.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B0D17', // Deep space dark
    zIndex: 999999,
    elevation: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  spinner: {
    marginBottom: 20,
  },
  title: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});
