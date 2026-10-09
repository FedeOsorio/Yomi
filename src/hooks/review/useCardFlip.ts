import { useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Giro 3D de la tarjeta de repaso (frente = pregunta, dorso = respuesta).
 * Devuelve los estilos animados de cada cara y funciones para girar.
 */
export function useCardFlip() {
  const flip = useRef(new Animated.Value(0)).current;

  const frontStyle = useMemo(
    () => ({
      backfaceVisibility: 'hidden' as const,
      opacity: flip.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] }),
      transform: [{ perspective: 1000 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
    }),
    [flip]
  );

  const backStyle = useMemo(
    () => ({
      backfaceVisibility: 'hidden' as const,
      opacity: flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] }),
      transform: [{ perspective: 1000 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
    }),
    [flip]
  );

  /** Muestra el dorso. `onDone` se llama solo si el giro terminó (no si se interrumpió). */
  const showBack = (duration: number, onDone?: () => void) => {
    Animated.timing(flip, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) onDone?.();
      }
    );
  };

  /** Vuelve al frente. `onDone` se llama al terminar, se haya completado o no. */
  const showFront = (duration: number, onDone?: () => void) => {
    Animated.timing(flip, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(() =>
      onDone?.()
    );
  };

  /** Deja la tarjeta de frente sin animación. */
  const reset = () => flip.setValue(0);

  return { frontStyle, backStyle, showBack, showFront, reset };
}
