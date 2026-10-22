import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';

/**
 * Navegación que deja pasar un solo movimiento por vez. Varios toques rápidos antes de que la pantalla cambie
 * abrían una copia por toque (y había que volver atrás otras tantas veces), o volvían atrás dos pantallas.
 * Se destraba cuando esta pantalla vuelve a tener el foco.
 */
export function useSingleNavigation() {
  const router = useRouter();
  const navigating = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navigating.current = false;
    }, [])
  );

  return useMemo(() => {
    const once = (go: () => void) => {
      if (navigating.current) return;
      navigating.current = true;
      go();
    };
    return {
      push: (href: Href) => once(() => router.push(href)),
      back: () => once(() => router.back()),
    };
  }, [router]);
}
