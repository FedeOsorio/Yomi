# Caso de Uso: Búsqueda por Pinyin

## Descripción
El usuario abre la modal de búsqueda desde el botón flotante `+` ("Agregar pinyin") en la pantalla principal de mazos. Escribe pinyin (con o sin tonos) en la barra de búsqueda y obtiene resultados del diccionario CC-CEDICT o la opción de construir una palabra personalizada.

## Actores
- Usuario

## Precondiciones
- La base de datos `yomi.db` fue pre-generada y contiene las entradas de CC-CEDICT.
- La app está abierta en la pantalla principal de Mazos.

## Flujo Principal
1. El usuario presiona el botón `+` (FAB) y selecciona "Agregar pinyin".
2. Se abre el modal de búsqueda `src/app/search.tsx`.
3. El usuario escribe pinyin en el campo de texto (ej. `nihao`).
4. El sistema normaliza la entrada usando `lib/pinyin-utils.ts` → `toSearchKey()`.
5. El sistema busca coincidencias exactas en `yomi.db` por `pinyin_key`.
6. Si hay resultados exactos, los muestra como tarjetas con: caracteres simplificados, pinyin con marcas diacríticas, traducciones y botón de guardado rápido (+).

## Flujo Alternativo: Word Builder / Sin Coincidencia Exacta
1. Si no hay coincidencia exacta (o para pinyin combinado como `wo hai méi` o `xiela`), el sistema segmenta la entrada en sílabas (`wo`, `hai`, `mei`).
2. Detecta si alguna sílaba contiene tono específico (con tildes diacríticas o números, ej. `méi` / `mei2` $\rightarrow$ Tono 2).
3. Busca caracteres individuales de 1 sílaba para cada sílaba detectada, filtrando estrictamente por el tono indicado en caso de haberse especificado.
4. Presenta la interfaz **Word Builder** con filas de selección de caracteres por sílaba y un campo para el significado en español.
5. El usuario selecciona los caracteres deseados, el significado en español se calcula y autocompleta automáticamente según la combinación de Hanzi seleccionada (permitiendo edición manual si se desea) y presiona "Guardar".

## Archivos Involucrados
- `src/app/search.tsx` — Pantalla modal de búsqueda y Word Builder (UI).
- `lib/search-engine.ts` — Funciones `searchByPinyin()`, `getChineseSpanishMeaning()`.
- `lib/word-service.ts` — Funciones `saveWords()`, `saveCustomWord()`.

## Resultado Esperado
- Búsqueda en tiempo real de palabras exactas.
- Si no existe la palabra exacta, opción fluida para construir la palabra por sílabas con cálculo automático de su significado en español.

