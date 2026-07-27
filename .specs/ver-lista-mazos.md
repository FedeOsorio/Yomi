# Caso de Uso: Ver Lista de Mazos

## Descripción
El usuario puede ver todos sus mazos de vocabulario en la pestaña "Mazos" y navegar al detalle de cada uno.

## Actores
- Usuario

## Precondiciones
- La app está abierta.

## Flujo Principal
1. El usuario navega a la pestaña "Mazos".
2. El sistema consulta `lib/deck-service.ts` → `getDecks()` que lee la tabla `decks` de SQLite.
3. Se muestra la lista de mazos como tarjetas con ícono y nombre.
4. El usuario toca un mazo.
5. Se navega a `src/app/deck/[id].tsx` pasando el `id` del mazo como parámetro dinámico.

## Flujo Alternativo: Sin Mazos
1. Si el usuario nunca guardó una palabra, la lista está vacía.
2. El mazo "Mi Vocabulario" se crea automáticamente la primera vez que el usuario guarda una palabra (no antes).

## Archivos Involucrados
- `src/app/(tabs)/decks.tsx` — Pantalla de lista de mazos.
- `lib/deck-service.ts` — Función `getDecks()`.
- `db/schema.ts` — Tabla `decks`.

## Resultado Esperado
- El usuario ve todos sus mazos listados.
- Puede tocar cualquier mazo para ver su contenido.
