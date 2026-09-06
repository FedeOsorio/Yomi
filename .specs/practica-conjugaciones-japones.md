# Caso de Uso: Práctica de Conjugaciones Japonesas y Categorización Gramatical

## Descripción
Permite categorizar automáticamente las palabras japonesas ingresadas (`category`: Verbo Ichidan, Verbo Godan, Verbo Irregular, Adjetivo -i, Adjetivo -na, Sustantivo, Frase), consultar o guardar formas conjugadas (como la forma *-te*), y ejercitar activamente la conversión entre la forma de diccionario y las distintas conjugaciones gramaticales mediante voz o teclado desde el mazo.

---

## Actores
- Usuario que estudia japonés (`ja-JP`).

---

## Precondiciones
1. El usuario tiene un mazo con idioma japonés configurado (`ja-JP`).
2. El usuario busca vocabulario en la pantalla de búsqueda o tiene palabras guardadas en su mazo.

---

## Flujo 1: Detección Automática de Categoría Gramatical (`category`)
1. El usuario busca una palabra o frase en japonés (en Romaji, Kana o Kanji).
2. El motor consulta JMdict/Jisho y extrae `parts_of_speech`, mapeándolos a categorías normalizadas en español:
   - `Verbo Godan (Grupo 1)`
   - `Verbo Ichidan (Grupo 2)`
   - `Verbo Irregular (Grupo 3)`
   - `Adjetivo -i`
   - `Adjetivo -na`
   - `Sustantivo`
   - `Frase / Expresión`
3. Si la palabra es personalizada o no se encuentra en el diccionario, la función heurística `classifyJapaneseWord` determina la categoría analizando las terminaciones morfológicas.
4. Cada resultado muestra visualmente un badge con su categoría gramatical junto a su nivel JLPT.

---

## Flujo 2: Guardado Inteligente con Pregunta de Conjugación
1. El usuario toca el botón de guardar (+) sobre una palabra en los resultados de búsqueda.
2. **Si la palabra es un Sustantivo u otra categoría no conjugable:**
   - Se guarda directamente en el mazo sin interrumpir al usuario.
3. **Si la palabra es un Verbo o Adjetivo (o el usuario buscó una forma conjugada como `tabete`):**
   - El sistema muestra un diálogo de confirmación:
     - **Título**: *"¿Quieres agregar el verbo al ejercicio de conjugación?"*
     - **Mensaje**: *"(esto guarda también automáticamente la forma diccionario)"*
     - **Opción A: "No, solo tarjeta directa"**: Guarda la palabra tal como fue buscada.
     - **Opción B: "Sí, agregar con conjugación"**: Guarda la forma de diccionario de la palabra con `conjugationEnabled: true`.

---

## Flujo 3: Práctica de Conjugaciones en el Mazo
1. El usuario entra al detalle de un mazo de japonés (`deck/[id]`).
2. Si el mazo contiene verbos o adjetivos conjugables, se muestra un botón destacado: **"Conjugaciones"** con ícono de destellos.
3. Al tocar el botón, se abre el modal interactivo `ConjugationPracticeModal`.
4. El usuario puede seleccionar qué forma gramatical desea ejercitar:
   - Forma -TE (`-て / -で`) (por defecto).
   - Pasado -TA (`-た / -だ`).
   - Negativo -NAI (`-ない`).
   - Cortés -MASU (`-ます`).
5. La pantalla presenta un verbo base al azar (con Furigana, significado y categoría) y le solicita convertirlo a la forma elegida.
6. El usuario puede responder por:
   - **Voz**: Habla en japonés y el reconocedor transcribe y valida la pronunciación.
   - **Teclado**: Escribe en Romaji o Kana (con conversión instantánea Romaji $\rightarrow$ Hiragana).
7. Al evaluar:
   - Si es correcto: Notificación de acierto, lectura por audio TTS y suma de puntos.
   - Si es incorrecto: Muestra la forma conjugada exacta esperada.
8. Al terminar todas las palabras del mazo, se muestra el resumen con el puntaje final y la opción de volver a practicar.

---

## Archivos Involucrados
- `lib/japanese-utils.ts` — `classifyJapaneseWord()`, `conjugateJapanese()`, `toNormalizedHiragana()`.
- `lib/japanese-search.ts` — `mapJishoPartsOfSpeech()`, parsing de `parts_of_speech` y Furigana.
- `lib/word-service.ts` — `saveGenericWord()`, `getConjugableWordsForDeck()`, persistencia en `auxiliaryInfo`.
- `src/components/ConjugationPracticeModal.tsx` — Modal de entrenamiento interactivo.
- `src/app/search.tsx` — Detección, badges y diálogo condicional.
- `src/app/deck/[id].tsx` — Botón de conjugaciones y listado filtrable.
- `src/app/word/[id].tsx` — Ficha de la palabra con categoría y nivel JLPT.
