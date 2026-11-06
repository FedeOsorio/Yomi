import { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * Giro 3D de la tarjeta de repaso (frente = pregunta, dorso = respuesta), con Reanimated: corre en el hilo de
 * la interfaz. Devuelve los estilos animados de cada cara y funciones para girar.
 */
export function useCardFlip() {
  const flip = useSharedValue(0);

  const frontStyle = useAnimatedStyle(() => ({
    backfaceVisibility: 'hidden',
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    backfaceVisibility: 'hidden',
    opacity: flip.value > 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  /** Muestra el dorso. `onDone` se llama solo si el giro terminó (no si se interrumpió). */
  const showBack = (duration: number, onDone?: () => void) => {
    flip.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished && onDone) scheduleOnRN(onDone);
    });
  };

  /** Vuelve al frente. `onDone` se llama al terminar, se haya completado o no. */
  const showFront = (duration: number, onDone?: () => void) => {
    flip.value = withTiming(0, { duration, easing: Easing.inOut(Easing.ease) }, () => {
      'worklet';
      if (onDone) scheduleOnRN(onDone);
    });
  };

  /** Deja la tarjeta de frente sin animación. */
  const reset = () => {
    cancelAnimation(flip);
    flip.value = 0;
  };

  return { frontStyle, backStyle, showBack, showFront, reset };
}
