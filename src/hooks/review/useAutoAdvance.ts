import { useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Cuenta regresiva que pasa sola a la siguiente tarjeta (modo voz), con barra de progreso
 * y posibilidad de pausarla mientras el usuario toca la pantalla.
 */
export function useAutoAdvance() {
  const progress = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onElapsed = useRef<() => void>(() => {});
  const startedAt = useRef(0);
  const duration = useRef(0);
  const remaining = useRef(0);
  const paused = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const run = (ms: number) => {
    startedAt.current = Date.now();
    duration.current = ms;
    Animated.timing(progress, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }).start();
    timer.current = setTimeout(() => onElapsed.current(), ms);
  };

  /** Arranca la cuenta desde cero; al terminar llama a `callback`. */
  const start = (ms: number, callback: () => void) => {
    clearTimer();
    progress.stopAnimation();
    progress.setValue(0);
    onElapsed.current = callback;
    remaining.current = ms;
    paused.current = false;
    run(ms);
  };

  const pause = () => {
    if (paused.current || !timer.current) return;
    paused.current = true;
    clearTimer();
    progress.stopAnimation((value) => {
      remaining.current = Math.max(duration.current - (Date.now() - startedAt.current), 500);
      progress.setValue(value);
    });
  };

  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    run(remaining.current);
  };

  /** Cancela la cuenta y vacía la barra. */
  const cancel = () => {
    clearTimer();
    paused.current = false;
    progress.stopAnimation();
    progress.setValue(0);
  };

  return { progress, start, pause, resume, cancel };
}
