# Caso de Uso: Ver Lista de Mazos (Pantalla Principal)

## Descripción
El usuario ve la lista de todos sus mazos de vocabulario directamente al abrir la aplicación (pantalla inicial `index.tsx`). Desde esta pantalla puede navegar al detalle de cada mazo o presionar el botón flotante `+` para agregar palabras o pinyin.

## Actores
- Usuario

## Precondiciones
- La app está abierta.

## Flujo Principal
1. El usuario abre la aplicación y es recibido directamente en la pantalla de Mazos (`src/app/(tabs)/index.tsx`).
2. El sistema consulta `lib/deck-service.ts` → `getDecks()` que lee la tabla `decks` de SQLite.
3. Se muestra la lista de mazos como tarjetas.
4. El usuario ve un botón flotante `+` (FAB) abajo a la derecha de la pantalla.
5. Si el usuario toca un mazo, navega al detalle `src/app/deck/[id].tsx`.
6. Si el usuario toca el botón `+`, se despliega el menú contextual con la opción "Agregar pinyin", que abre `src/app/search.tsx`.

## Archivos Involucrados
- `src/app/(tabs)/index.tsx` — Pantalla principal de la app.
- `lib/deck-service.ts` — Función `getDecks()`.
- `db/schema.ts` — Tabla `decks`.

## Resultado Esperado
- La pantalla principal muestra directamente las colecciones/mazos del usuario y el acceso rápido `+`.
