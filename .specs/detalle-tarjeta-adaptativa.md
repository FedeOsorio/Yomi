# Caso de Uso: Detalle de Tarjeta Adaptativa por Idioma

## Descripción
Permite al usuario abrir una tarjeta guardada en un mazo y visualizar una ficha completa y adaptativa según el idioma del mazo (`languageCode`). Muestra caracteres/palabra principal, audio TTS nativo, lecturas fonéticas, significados, trazado ideográfico, 2-3 palabras compuestas comunes obtenidas del diccionario local y el estado de retención SRS (FSRS).

## Actores
- Usuario que está estudiando vocabulario.

## Precondiciones
- La tarjeta (`words`) existe en la base de datos asociada a un mazo (`decks`).
- El asset de diccionario SQLite local está inicializado.

## Flujo Principal
1. El usuario abre un mazo desde la lista de colecciones ([deck/[id].tsx](file:///e:/Yomi/src/app/deck/%5Bid%5D.tsx)).
2. El usuario toca cualquier tarjeta de la lista.
3. El sistema navega a [src/app/word/[id].tsx](file:///e:/Yomi/src/app/word/%5Bid%5D.tsx).
4. `getWordDetailWithRelations(wordId)` obtiene la palabra, su mazo, su registro FSRS (`srsItems`) y sus relaciones:
   - Si el idioma es ideográfico (Chino `zh-CN` o Japonés `ja-JP`):
     - Renderiza el carácter destacado en tamaño grande.
     - Botón de audio que invoca `speakText(palabra, lang)` vía `expo-speech`.
     - Lectura con pinyin/furigana.
     - Sección de Significados.
     - Sección de Trazado de caracteres y recuento.
     - Sección de 2 a 3 palabras compuestas comunes del diccionario local que usan ese carácter.
   - Si el idioma es alfabético (Español `es-ES`, Inglés `en-US`):
     - Renderiza la palabra principal y botón de pronunciación nativa.
     - Definición y categoría gramatical limpia (sin cajas de trazado ideográfico).
   - En ambos casos muestra la **Ficha SRS** con su estado FSRS (Nueva, Aprendiendo, En Repaso), número de repasos y fecha del próximo repaso.
5. El usuario puede tocar el icono de papelera para eliminar la palabra y su tarjeta SRS asociada.

## Archivos Involucrados
- `src/app/word/[id].tsx` — Pantalla de detalle de tarjeta adaptativa.
- `src/app/deck/[id].tsx` — Lista de palabras del mazo con navegación a la tarjeta.
- `lib/word-service.ts` — `getWordDetailWithRelations()`, `getCompoundWordsForChar()`, `deleteWord()`.
- `lib/audio-service.ts` — `speakText()` con `expo-speech`.
- `db/schema.ts` — Tablas `words`, `decks`, `srsItems`.
- `db/dict-schema.ts` — Tabla `dictionaryEntries`.
