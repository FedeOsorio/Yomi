import React from 'react';
import { GestureResponderEvent, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 200, easing: Easing.out(Easing.cubic) };

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Opacidad mientras se aprieta (como en TouchableOpacity). */
  activeOpacity?: number;
  /** Tamaño mientras se aprieta (1 = no se achica). En tarjetas grandes conviene acercarlo a 1. */
  scaleTo?: number;
}

/**
 * Botón que se achica apenas y se atenúa al apretarlo, con Reanimated (corre en el hilo de la interfaz).
 * Reemplaza a TouchableOpacity con las mismas props de uso común (style, onPress, onLongPress, disabled,
 * activeOpacity, hitSlop…). Es un Pressable de React Native y no de gesture-handler: así funciona igual
 * dentro de los Modal de Android. Respeta "reducir movimiento" del sistema (solo se atenúa).
 * La escala reemplaza un `transform` del estilo: no usarlo en botones que ya tengan uno.
 */
export function PressableScale({
  style,
  activeOpacity = 0.85,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  // La opacidad propia del estilo (por ejemplo, un botón deshabilitado al 0.7) se respeta
  const styleOpacity = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof styleOpacity === 'number' ? styleOpacity : 1;
  const minScale = reduceMotion ? 1 : scaleTo;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: baseOpacity * (1 - pressed.value * (1 - activeOpacity)),
    transform: [{ scale: 1 - pressed.value * (1 - minScale) }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    pressed.value = withTiming(1, PRESS_IN);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    pressed.value = withTiming(0, PRESS_OUT);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable {...rest} style={[style, animatedStyle]} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      {children}
    </AnimatedPressable>
  );
}
