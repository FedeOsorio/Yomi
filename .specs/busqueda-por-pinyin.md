# Caso de Uso: Búsqueda por Pinyin

## Descripción
El usuario escribe pinyin (con o sin tonos) en la barra de búsqueda y obtiene resultados del diccionario CC-CEDICT en tiempo real.

## Actores
- Usuario

## Precondiciones
- La base de datos `dictionary.db` fue pre-generada con el script `scripts/build-dictionary.ts` y contiene las 124.733 entradas de CC-CEDICT.
- La app está abierta en la pestaña "Buscar".

## Flujo Principal
1. El usuario escribe pinyin en el campo de texto (ej. `nihao`).
2. El sistema normaliza la entrada usando `lib/pinyin-utils.ts` → `toSearchKey()`:
   - Convierte a minúsculas.
   - Remueve tonos numéricos.
   - Normaliza `ü`/`v`/`u:` a `v`.
3. El sistema busca coincidencias exactas en `dictionary.db` por `pinyin_key`.
4. Si hay resultados, los muestra como tarjetas con: caracteres simplificados, pinyin con marcas diacríticas, y traducciones al inglés.

## Flujo Alternativo: Segmentación
1. Si no hay coincidencia exacta, el sistema usa `lib/pinyin-segmenter.ts` → `bestSegmentation()` para separar la entrada en sílabas válidas.
2. Busca cada sílaba individualmente en el diccionario.
3. Muestra los resultados agrupados con un banner indicando la segmentación detectada (ej. "xi + huan").
4. Ofrece un botón "Seleccionar..." que abre el Picker modal.

## Flujo Alternativo: Sin Resultados
1. Si no se encuentra ninguna coincidencia ni segmentación válida, muestra el mensaje "Pinyin no reconocido".

## Archivos Involucrados
- `src/app/(tabs)/index.tsx` — Pantalla de búsqueda (UI).
- `lib/search-engine.ts` — Función `searchByPinyin()`.
- `lib/pinyin-utils.ts` — Funciones `toSearchKey()`, `numericToDisplay()`.
- `lib/pinyin-segmenter.ts` — Funciones `segmentPinyin()`, `bestSegmentation()`.
- `db/schema.ts` — Tabla `dictionary_entries`.

## Resultado Esperado
- El usuario ve una lista de resultados en tiempo real mientras escribe.
- Cada resultado muestra: carácter simplificado, pinyin con diacríticos, y significados en inglés.
