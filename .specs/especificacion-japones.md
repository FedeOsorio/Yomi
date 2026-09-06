# Especificación: Procesamiento y Repaso de Japonés

## Descripción
Define las reglas de búsqueda, conversión silábica (Romaji a Hiragana/Katakana), análisis morfológico de Furigana (etiqueta Ruby), trazado KanjiVG y evaluación de repaso por voz para Japonés (`ja-JP`).

---

## 1. Entrada y Búsqueda de Vocabulario
1. **Conversión Romaji / Kana**:
   - `lib/japanese-utils.ts` convierte en tiempo real el texto ingresado en alfabeto latino (Romaji) a Hiragana (ej. `arigatou` $\rightarrow$ `ありがとう`, `taberu` $\rightarrow$ `たべる`).
2. **Búsqueda en Diccionario JMdict / Jisho**:
   - Consulta la API pública de Jisho con ordenamiento inteligente:
     1. Coincidencia exacta de lectura/kanji común (`is_common`).
     2. Coincidencia exacta de lectura/kanji.
     3. Palabras comunes que inician con la sílaba.
3. **Desconjugación Morfológica Automática (`deconjugateJapanese`)**:
   - Si el usuario busca formas verbales o adjetivales conjugadas (ej. forma *-te* `tabete` / `食べて`, forma *-ta* `tabeta`, forma *-masu* `tabemasu`, forma *-nai* `tabenai` o adjetivos `oishikute`), el motor revierte la conjugación automáticamente a su forma de diccionario (*Jisho-kei* `食べる` / `美味しい`) para encontrar la entrada en JMdict sin que el usuario tenga que saber la raíz no conjugada.
4. **Traducción Automática**:
   - Traducción de glosas del inglés al español con limpieza de duplicados y mayúscula inicial (`cleanAndFormatMeanings`).
5. **Clasificación JLPT**:
   - Detección automática de nivel JLPT (N5 a N1) mediante `lib/jlpt-data.ts`.
6. **Detección de Categoría Gramatical (`category`)**:
   - Mapeo de `parts_of_speech` de JMdict/Jisho y clasificación morfológica heurística (`classifyJapaneseWord`, `mapJishoPartsOfSpeech`):
     - `Verbo Ichidan (Grupo 2)` (ej. 食べる, 見る).
     - `Verbo Godan (Grupo 1)` (ej. 行く, 飲む, 待つ).
     - `Verbo Irregular (Grupo 3)` (ej. する, くる, 来る).
     - `Adjetivo -i` (ej. 美味しい, 寒い).
     - `Adjetivo -na` (ej. 静か, 綺麗).
     - `Sustantivo` (ej. 自転車, 本).
     - `Frase / Expresión` (ej. ちょっと待ってください).
   - Se almacena en `words.auxiliaryInfo` y se expone visualmente mediante badges en búsqueda, detalle de palabra y listado de mazo.
7. **Guardado Condicional para Ejercicios de Conjugación**:
   - Al guardar un verbo o adjetivo, la app ofrece agregarlo con la práctica de conjugación habilitada (`conjugationEnabled: true`) guardando la forma de diccionario asociada.
8. **Motor de Conjugación y Práctica en Mazo**:
   - `conjugateJapanese(word, reading, category, form)` genera formas exactas (-TE, -TA, -NAI, -MASU).
   - Modal interactivo `ConjugationPracticeModal` activado desde la pantalla del mazo (`deck/[id]`) para practicar con reconocimiento de voz o teclado en vivo.

---

## 2. Parsing de Furigana (Ruby)
- `parseFurigana(kanji, reading)`:
  - Asocia de forma quirúrgica la lectura en Kana **exclusivamente a los caracteres Kanji**, dejando los Okurigana (Kana que acompañan la raíz verbal o adjetival) sin furigana duplicado.
  - Ejemplo: `食べる` con lectura `たべる` genera el par `{ char: "食", furigana: "た" }` y `{ char: "べる" }`.

---

## 3. Reconocimiento de Voz y Números Japoneses
1. **Configuración Acústica**:
   - Motor nativo con locale `ja-JP`.
2. **Mapeo Numérico (`JA_NUMBERS`)**:
   - Si el usuario pronuncia números (ej. "ichi", "juuichi") y el motor de Google devuelve números arábigos ("1", "11"), `srs-engine.ts` los normaliza a su equivalente en Kana (`いち`, `じゅういち`) y Kanji (`一`, `十一`) para evitar falsos negativos.
3. **Normalización Fonética**:
   - Conversión de transcripción y lectura esperada a Hiragana plano antes de contrastar (`toNormalizedHiragana`).

---

## 4. Trazado de Kanjis (KanjiVG)
- Carga de diagramas de trazos desde el repositorio KanjiVG (`parsimonhi/kanjivg`).
- Animación trazo por trazo con números de orden y visualización de componentes.

---

## Archivos Involucrados
- `lib/japanese-utils.ts` — Tablas y algoritmos de conversión Romaji/Katakana, clasificación de categoría (`classifyJapaneseWord`) y conjugación (`conjugateJapanese`).
- `lib/japanese-search.ts` — Búsqueda, mapeo POS (`mapJishoPartsOfSpeech`), parsing de Furigana y traducción al español.
- `lib/jlpt-data.ts` — Diccionario de niveles JLPT N5 a N1.
- `lib/word-service.ts` — Guardado con `category` y `conjugationEnabled`, y selector `getConjugableWordsForDeck`.
- `src/components/ConjugationPracticeModal.tsx` — Modal interactivo de práctica de conjugaciones.
- `src/app/deck/[id].tsx` — Botón de conjugaciones y badges por tarjeta.
- `src/app/search.tsx` — Diálogo condicional de conjugación y badges de categoría.
- `src/app/word/[id].tsx` — Ficha de la palabra con categoría, JLPT y trazado KanjiVG.
