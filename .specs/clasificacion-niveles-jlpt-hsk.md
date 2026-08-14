# Caso de Uso: Clasificación y Visualización de Niveles Oficiales (JLPT / HSK)

## Descripción
Permite al usuario identificar y diferenciar las palabras según su nivel oficial en los exámenes de certificación de idiomas (JLPT N5 a N1 para Japonés, HSK 1 a 6 para Chino). Los niveles se extraen automáticamente de los diccionarios de referencia y se exhiben mediante badges visuales en la búsqueda, en la lista del mazo y en el detalle de la tarjeta.

## Actores
- Usuario estudiante de Japonés (JLPT) o Chino (HSK).

## Precondiciones
- El mazo de destino tiene configurado el idioma correspondiente (`ja-JP` o `zh-CN`).

## Flujo Principal
1. **Detección y Búsqueda**:
   - En japonés, al buscar una palabra o kanji, `lib/japanese-search.ts` procesa el array de etiquetas `item.jlpt` y extrae el nivel canónico (`N5`, `N4`, `N3`, `N2`, `N1`).
   - En la lista de resultados de [src/app/search.tsx](file:///e:/Yomi/src/app/search.tsx), la tarjeta renderiza una badge destacada `[JLPT N5]`.
2. **Persistencia**:
   - Al tocar **+**, se invoca `saveGenericWord(deckId, { ..., level: entry.level })`.
   - Se serializa en la columna `auxiliary_info` de la tabla `words` como `{"level": "N5"}`.
3. **Visualización en el Mazo y Ficha de Detalle**:
   - En [src/app/deck/[id].tsx](file:///e:/Yomi/src/app/deck/%5Bid%5D.tsx), la palabra se presenta con su insignia de nivel junto al kanji.
   - En [src/app/word/[id].tsx](file:///e:/Yomi/src/app/word/%5Bid%5D.tsx), el encabezado de la ficha de detalle resalta `JLPT N5` / `HSK 1`.

## Archivos Involucrados
- `lib/japanese-search.ts` — Extracción del nivel JLPT.
- `lib/word-service.ts` — Persistencia y lectura de `auxiliaryInfo.level`.
- `src/app/search.tsx` — Visualización de badges JLPT en resultados de búsqueda.
- `src/app/deck/[id].tsx` — Renderizado de insignias de nivel en la lista del mazo.
- `src/app/word/[id].tsx` — Visualización del nivel en la ficha de detalle de la palabra.
- `db/schema.ts` — Columna `auxiliary_info` en la tabla `words`.
