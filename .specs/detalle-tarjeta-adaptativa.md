# Caso de Uso: Detalle de Tarjeta Adaptativa por Idioma

## Descripción
Permite al usuario abrir una tarjeta guardada en un mazo y visualizar una ficha completa y adaptativa según el idioma del mazo (`languageCode`). Muestra cabecera alineada a la izquierda, etiquetas Ruby de Furigana exactamente sobre cada Kanji con su lectura debajo (limitado al 55% de ancho con auto-escalado), audio TTS nativo, significados desduplicados y capitalizados, vista de trazado en una sola línea al 100%, 2-3 palabras compuestas comunes obtenidas del diccionario local y el estado de retención SRS (FSRS).

## Actores
- Usuario que está estudiando vocabulario.

## Precondiciones
- La tarjeta (`words`) existe en la base de datos asociada a un mazo (`decks`).
- El asset de diccionario SQLite local está inicializado.

## Flujo Principal
1. El usuario abre un mazo desde la lista de colecciones ([deck/[id].tsx](file:///e:/Yomi/src/app/deck/%5Bid%5D.tsx)).
2. El usuario toca cualquier tarjeta de la lista.
3. El sistema navega a [src/app/word/[id].tsx](file:///e:/Yomi/src/app/word/%5Bid%5D.tsx).
4. La cabecera superior despliega `"Yomi • Detalle de Palabra"` alineada a la izquierda junto al botón de retroceso.
5. `getWordDetailWithRelations(wordId)` obtiene los datos localmente sin latencia de red (0 peticiones HTTP).
6. Presentación de tarjeta adaptativa:
    - En Kanji / Hanzi (`ja-JP` / `zh-CN`):
      - `parseFurigana` renderiza etiquetas Ruby concéntricas sobre cada Kanji con la lectura completa en Hiragana/Pinyin debidamente posicionada debajo.
      - Ancho de palabra limitado a máx `55%` con auto-escalado de fuente (`adjustsFontSizeToFit`).
      - Trazado de caracteres configurado a 1 sola línea al `100%` de ancho sin saltos.
      - Desglose y modal interactivo de trazado paso a paso con motor adaptativo por idioma:
        - Para Hanzi (`zh-CN`): consulta exclusivamente `AnimCJK` (`svgsZhHans`, `svgsJa`, `svgsZhHant`), renderizando con `<Defs><ClipPath>` y animación de trazo proporcional, garantizando que todos los caracteres del desglose provengan del mismo repositorio sin mezclar con KanjiVG.
        - Para Kanji (`ja-JP`): consulta `KanjiVG` (109x109) con números de orden de trazo y fallback a `AnimCJK`.
      - 2 a 3 palabras compuestas comunes del diccionario local que usan ese carácter, presentadas en un contenedor estable con indicador de carga (`ActivityIndicator` y texto descriptivo) durante la consulta asíncrona, y almacenamiento en caché local (`yomi_compounds_cache_v2_`) para despliegue instantáneo en visitas posteriores sin saltos de interfaz (layout shifts).
   - En idiomas alfabéticos (`en-US`, `es-ES`):
     - Palabra en tamaño grande, pronunciación nativa y significados formateados.
   - En ambos casos muestra la **Ficha SRS** con su estado FSRS (Nueva, Aprendiendo, En Repaso), número de repasos y fecha del próximo repaso.
7. **Gestión de Significados**:
   - Cada significado listado permite edición directa (icono de lápiz) mediante modal con campo de texto interactivo para corregir o personalizar la definición a gusto del usuario.
   - Si la palabra tiene más de un significado, permite eliminar acepciones no deseadas (icono de papelera).
   - Ambos cambios sincronizan inmediatamente el JSON de `words.meanings`, la selección activa en `words.auxiliaryInfo` y el ítem de repaso en `srsItems.displayMeaning`.
8. El usuario puede tocar el icono de papelera en la barra superior para eliminar la palabra y su tarjeta SRS asociada por completo.

## Archivos Involucrados
- `src/app/word/[id].tsx` — Pantalla de detalle de tarjeta adaptativa.
- `lib/japanese-search.ts` — `parseFurigana()`, `cleanAndFormatMeanings()`.
- `src/app/deck/[id].tsx` — Lista de palabras del mazo con navegación a la tarjeta.
- `lib/word-service.ts` — `getWordDetailWithRelations()`, `getCompoundWordsForChar()`, `deleteWord()`.
- `lib/audio-service.ts` — `speakText()` con `expo-speech`.
- `db/schema.ts` — Tablas `words`, `decks`, `srsItems`.
- `db/dict-schema.ts` — Tabla `dictionaryEntries`.
