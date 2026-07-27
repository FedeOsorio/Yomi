# Caso de Uso: Ver Detalle de Mazo

## Descripción
El usuario puede ver todas las palabras guardadas dentro de un mazo específico, mostrando caracteres, pinyin y significados.

## Actores
- Usuario

## Precondiciones
- El usuario navegó a la pestaña "Mazos" y tocó un mazo existente.

## Flujo Principal
1. Se carga la pantalla de detalle con el `id` del mazo obtenido de la URL dinámica (`useLocalSearchParams()`).
2. El sistema consulta la tabla `words` filtrando por `deckId` usando Drizzle ORM.
3. Se muestra un contador de palabras y la lista de palabras guardadas.
4. Cada palabra muestra: carácter simplificado, pinyin con diacríticos, y significados.

## Flujo Alternativo: Mazo Vacío
1. Si el mazo no tiene palabras, se muestra "Palabras (0)" y la lista queda vacía.

## Archivos Involucrados
- `src/app/deck/[id].tsx` — Pantalla de detalle del mazo.
- `db/schema.ts` — Tabla `words`.
- `db/index.ts` — Conexión a SQLite con Drizzle.

## Resultado Esperado
- El usuario ve todas las palabras que guardó en ese mazo.
- Cada palabra muestra su información completa (carácter, pinyin, significados).
