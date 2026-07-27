# Caso de Uso: Selección Múltiple de Candidatos (Picker)

## Descripción
Cuando una búsqueda por pinyin devuelve múltiples candidatos (homófonos o resultados de segmentación), el usuario puede abrir un modal para seleccionar cuáles quiere guardar en su mazo.

## Actores
- Usuario

## Precondiciones
- El usuario realizó una búsqueda por pinyin que activó la segmentación (no hubo coincidencia exacta directa).
- Se muestra el banner de segmentación con el botón "Seleccionar...".

## Flujo Principal
1. El usuario toca el botón "Seleccionar..." en el banner de segmentación.
2. Se abre un modal (`src/app/search/picker.tsx`) con la lista de candidatos.
3. El usuario toca una o varias tarjetas para seleccionarlas (checkbox circular).
4. El usuario toca "Guardar N palabra(s)".
5. El sistema guarda todas las palabras seleccionadas usando `saveWords()` (misma lógica que el guardado rápido, con protección anti-duplicados).
6. El modal se cierra automáticamente.

## Flujo Alternativo: Sin Selección
1. Si el usuario no selecciona ninguna tarjeta, el botón "Guardar" aparece deshabilitado (gris).
2. El usuario puede cerrar el modal sin guardar nada.

## Datos Transferidos
- Los candidatos se pasan como parámetro de navegación serializado en JSON (`candidates`).
- Se deserializan como `DictionaryEntry[]` en el Picker.

## Archivos Involucrados
- `src/app/(tabs)/index.tsx` — Botón "Seleccionar..." que navega al picker con `router.push()`.
- `src/app/search/picker.tsx` — Modal con lista de selección múltiple.
- `lib/word-service.ts` — Función `saveWords()`.
- `lib/deck-service.ts` — Función `getDefaultDeckId()`.

## Resultado Esperado
- El usuario puede elegir qué palabras guardar de un conjunto de resultados ambiguos.
- Las palabras seleccionadas se guardan en el mazo con sus tarjetas SRS.
- No se crean duplicados.
