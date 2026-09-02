# Especificación: Procesamiento y Repaso de Chino (Mandarín)

## Descripción
Define las reglas de búsqueda, segmentación, persistencia, trazado y evaluación de voz/tonos para el aprendizaje de Chino Mandarín (`zh-CN`).

---

## 1. Entrada y Búsqueda de Vocabulario
1. **Entrada de Pinyin**:
   - Soporta pinyin sin tonos (ej. `nihao`), pinyin numérico (`ni3 hao3`) o caracteres directos (Hanzi `你好`).
   - Normalización a clave de búsqueda (`toSearchKey`) que unifica `ü` y `v`.
2. **Diccionario Integrado**:
   - Base de datos SQLite local de CC-CEDICT (`dictionary_entries`).
3. **Word Builder por Sílabas**:
   - Si no existe la palabra compuesta exacta, el segmentador (`pinyin-segmenter.ts`) divide la cadena en sílabas fonéticas válidas y presenta candidatos para componer la palabra manualmente.
4. **Clasificación de Nivel**:
   - Detección y etiquetado automático de HSK (HSK 1 a HSK 6) mediante `lib/hsk-data.ts`.

---

## 2. Reconocimiento de Voz y Evaluación de Tonos
1. **Configuración Acústica**:
   - Se utiliza el motor de voz nativo con locale `zh-CN`.
   - Los modelos acústicos de Mandarín discriminan tonos directamente al transcribir caracteres Hanzi.
2. **Evaluación de Coincidencias (`checkVoiceMatch`)**:
   - **Coincidencia Exacta de Hanzi**: Si el motor acústico devuelve los Hanzi correspondientes, se valida con 100% de precisión fonética y tonal.
   - **Coincidencia Fonética Pinyin (Permisiva)**: Si devuelve transcripción fonética, se normaliza y valida tanto con tono numérico/diacrítico como por base consonántica/vocálica.
3. **Puntuación y Desglose por Sílaba Pinyin**:
   - `calculateChineseAccuracyScore` y `computePinyinSyllableAccuracy` evalúan cada sílaba matemáticamente mediante **descomposición fonética y distancia de similitud Levenshtein**:
     - **Consonante Inicial (30%)**: Similitud fonética entre la consonante inicial esperada (`PINYIN_INITIALS`) y la emitida.
     - **Rima Vocálica (40%)**: Similitud de la combinación vocálica (`final`).
     - **Tono Diacrítico (30%)**: Concordancia del tono (1 al 5).
     - **Silencio / Sin emisión de voz**: 0% automático tanto general como en cada sílaba.
     - **Sin valores fijos/hardcodeados**: El porcentaje resultante (0-100%) es el resultado continuo y directo de la fórmula de similitud fonética.
   - **Visualización en la Tarjeta dada vuelta**:
     - Insignia general de porcentaje en la parte superior.
     - **Caja de Desglose por Sílaba** ubicada justo debajo de la pronunciación principal:
       - Tarjetas individuales por sílaba (`char` + `pinyin`).
       - Círculo de porcentaje SVG con arco de llenado codificado por color (Verde $\ge 90\%$, Ámbar $\ge 70\%$, Rojo $< 70\%$).
   - **Gesto de Pausa Táctil de Cuenta Regresiva**:
     - Presionar la pantalla pausa inmediatamente la barra de avance automático de 10s.
     - Al soltar el dedo, la barra y el temporizador se reanudan fluidamente desde el tiempo restante exacto.

---

## 3. Trazado de Caracteres (Stroke Order)
- Utiliza la fuente vectorial AnimCJK para la animación trazo por trazo de cada Hanzi.
- Detección de radicales y componentes.

---

## Archivos Involucrados
- `lib/pinyin-utils.ts` — Conversión numérica a diacrítica, extracción de tonos y cálculo de precisión.
- `lib/pinyin-segmenter.ts` — Segmentador greedy y de memorización de sílabas chinas.
- `lib/srs-engine.ts` — Motor de comparación fonética y persistencia FSRS.
- `src/app/(tabs)/review.tsx` — Interfaz de repaso con flip 3D y badge de precisión de voz.
- `src/app/word/[id].tsx` — Detalle del carácter con trazado AnimCJK.
