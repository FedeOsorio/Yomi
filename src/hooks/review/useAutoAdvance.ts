import { useCallback, useRef } from 'react';
import { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Al reanudar, la cuenta nunca queda con menos de esto: si no, pasaría de tarjeta apenas se suelta. */
const MIN_REMAINING_MS = 500;

/**
 * Cuenta regresiva que pasa sola a la siguiente tarjeta (modo voz), con barra de progreso y posibilidad de
 * pausarla mientras el usuario toca la pantalla. Es una sola animación de Reanimated: cuando se completa,
 * avisa; pausarla es detenerla (no hay temporizadores aparte que mantener sincronizados).
 */
export function useAutoAdvance() {
  const progress = useSharedValue(0);
  const onElapsed = useRef<() => void>(() => {});
  const total = useRef(0);
  const running = useRef(false);
  const paused = useRef(false);

  const elapsed = useCallback(() => {
    running.current = false;
    onElapsed.current();
  }, []);

  const run = (from: number, minMs = 0) => {
    progress.value = from;
    progress.value = withTiming(
      1,
      { duration: Math.max((1 - from) * total.current, minMs), easing: Easing.linear },
      (finished) => {
        'worklet';
        if (finished) scheduleOnRN(elapsed);
      }
    );
  };

  /** Arranca la cuenta desde cero; al terminar llama a `callback`. */
  const start = (ms: number, callback: () => void) => {
    onElapsed.current = callback;
    total.current = ms;
    running.current = true;
    paused.current = false;
    run(0);
  };

  const pause = () => {
    if (paused.current || !running.current) return;
    paused.current = true;
    cancelAnimation(progress);
  };

  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    run(progress.value, MIN_REMAINING_MS);
  };

  /** Cancela la cuenta y vacía la barra. */
  const cancel = () => {
    running.current = false;
    paused.current = false;
    cancelAnimation(progress);
    progress.value = 0;
  };

  /** Estilo de la barra de la cuenta (se llena de izquierda a derecha). */
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return { barStyle, start, pause, resume, cancel };
}
