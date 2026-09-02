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
- `lib/japanese-utils.ts` — Tablas y algoritmos de conversión Romaji/Katakana a Hiragana.
- `lib/japanese-search.ts` — Búsqueda, parsing de Furigana y traducción al español.
- `lib/jlpt-data.ts` — Diccionario de niveles JLPT N5 a N1.
- `lib/srs-engine.ts` — Evaluación fonética y soporte numérico multi-dígito.
- `src/app/(tabs)/review.tsx` — Repaso interactivo por voz y teclado con Furigana.
- `src/app/word/[id].tsx` — Ficha de la palabra con trazado KanjiVG.
