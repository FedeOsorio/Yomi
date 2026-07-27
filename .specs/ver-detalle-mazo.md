# Caso de Uso: Ver Detalle de Mazo y Eliminar Palabras

## Descripción
El usuario puede ver todas las palabras guardadas dentro de un mazo específico y eliminar individualmente las palabras que ya no desea mantener o repasar.

## Actores
- Usuario

## Precondiciones
- El usuario navegó a la pantalla principal de Mazos y tocó un mazo existente.

## Flujo Principal: Ver Palabras
1. Se carga la pantalla de detalle con el `id` del mazo obtenido de la URL dinámica (`useLocalSearchParams()`).
2. El sistema consulta la tabla `words` filtrando por `deckId` usando Drizzle ORM.
3. Se muestra un contador de palabras y la lista de tarjetas de palabras guardadas.
4. Cada palabra muestra: carácter simplificado, pinyin con diacríticos, significados e ícono de papelera.

## Flujo Secundario: Eliminar Palabra
1. El usuario toca el ícono de papelera (rojo) en la tarjeta de una palabra.
2. Se muestra un cuadro de diálogo de confirmación: *"¿Estás seguro de que querés eliminar '[palabra]' del mazo y de tus repasos?"*.
3. Si el usuario confirma:
   - Se invoca `lib/word-service.ts` → `deleteWord(wordId)`.
   - Se elimina el registro de la tabla `words` en SQLite.
   - Se elimina la tarjeta de repaso asociada de la tabla `srs_items`.
   - La lista se actualiza automáticamente.

## Archivos Involucrados
- `src/app/deck/[id].tsx` — Pantalla de detalle del mazo (UI).
- `lib/word-service.ts` — Función `deleteWord()`.
- `db/schema.ts` — Tablas `words` y `srs_items`.

## Resultado Esperado
- El usuario puede ver y eliminar palabras individualmente de sus mazos de forma segura y permanente.
