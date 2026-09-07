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
4. **Optimización de Coincidencia Exacta**: Si la búsqueda coincide con una palabra exacta o su forma de diccionario (ej. *tabete* $\rightarrow$ 食べる, *kesu* $\rightarrow$ 消す), se descartan compuestos largos no relacionados (como *tabesugiru*) y solo se procesan/traducen las acepciones de las coincidencias exactas.
5. Cada resultado muestra visualmente un badge con su categoría gramatical junto a su nivel JLPT.

---

## Flujo 2: Guardado Inteligente con Pregunta de Conjugación
1. El usuario toca el botón de guardar (+) sobre una palabra en los resultados de búsqueda.
2. **Si la palabra es un Sustantivo u otra categoría no conjugable:**
   - Se guarda directamente en el mazo sin interrumpir al usuario.
3. **Si la palabra es un Verbo o Adjetivo (o el usuario buscó una forma conjugada como `tabete`):**
   - El sistema muestra un diálogo de confirmación:
     - **Título**: *"¿Quieres agregar el verbo al ejercicio de conjugación?"*
     - **Mensaje**: *"Esto guarda automáticamente la forma diccionario"*
     - **Opción A: "No"**: Guarda la palabra tal como fue buscada.
     - **Opción B: "Sí"**: Guarda la forma de diccionario de la palabra con `conjugationEnabled: true`.

---

## Flujo 3: Práctica de Conjugaciones en el Mazo (Estilo Repaso SRS)
1. El usuario entra al detalle de un mazo de japonés (`deck/[id]`).
2. Al desplegar el menú de 3 puntos (...) en la barra superior, si el mazo contiene palabras conjugables se ofrece la opción **"Práctica de Conjugaciones"** (junto a **"Repasar mazo"**).
3. Al tocar la opción, se abre el modal interactivo `ConjugationPracticeModal`.
4. **Filtrado Estricto de Formas Base de Diccionario (Jisho-kei)**:
   - `getConjugableWordsForDeck` valida mediante `isJapaneseDictionaryForm` que **solo** se incluyan verbos o adjetivos en su forma base de diccionario (como 読む, 食べる, 飲む, 行く, する).
   - Se excluyen estrictamente formas que ya se encuentren conjugadas (-masu, -te, -ta, -nai) o tarjetas guardadas con `conjugationEnabled: false`.
5. **Cola Aleatoria Dinámica (Modo SRS)**:
   - Inicia por defecto en el modo `Aleatorio (Todas)`, construyendo una cola combinada de todas las palabras base y sus formas gramaticales válidas desordenadas aleatoriamente:
      - **Verbos**: Se conjugan en 9 formas (*Forma -TE*, *Forma -TE Negativa*, *Pasado*, *Negativo*, *Pasado Negativo*, *Forma Formal*, *Pasado Formal*, *Negativo Formal*, *Forma Volitiva*), con consignas limpias sin spoilers de terminaciones.
      - **Adjetivos (-i y -na)**: Se conjugan en 9 formas (*Forma -TE*, *Forma -TE Negativa*, *Pasado*, *Negativo*, *Pasado Negativo*, *Forma Adverbial*, *Forma Formal*, *Pasado Formal*, *Negativo Formal*), mostrando consignas neutras sin pistas de sufijos.
   - Garantiza pedir al menos una vez cada palabra y cada una de sus formas válidas.
6. El usuario puede responder por:
    - **Voz y Modo Continuo Automático**:
      - Al hablar en japonés, la transcripción reconocida en vivo se completa automáticamente en el campo de texto con normalización fonética de homófonos Kanji (ej. `呼んで` / `四で` $\rightarrow$ `よんで` para `読む`).
      - Si el usuario **mantiene presionado** el botón de voz (*Responder por voz*), se activa el **Modo Automático/Continuo** con animación de carga en el botón. En este modo, al avanzar automáticamente a la siguiente tarjeta, el micrófono se activa de inmediato para escuchar la nueva respuesta sin tener que presionar el botón cada vez.
      - Para detener la escucha y desactivar el modo continuo, basta con un **toque simple** sobre el botón activo (*Escuchando tu pronunciación...*), desactivando ambos instantáneamente.
    - **Teclado**: Escribe en Romaji o Kana (con conversión instantánea Romaji $\rightarrow$ Hiragana).
7. **Pasaje Automático y Transiciones Suaves entre Tarjetas**:
    - **Entrada Fluida de Retroalimentación**: Al evaluar la respuesta, el panel de retroalimentación (`feedbackBox`) aparece mediante una animación suave de opacidad y desplazamiento ascendente (`translateY: 10 → 0`, 200ms) usando `useNativeDriver: true`, erradicando saltos abruptos o parpadeos.
    - Al evaluar la respuesta, se muestra la forma en Kanji y debajo su lectura en Hiragana (sin paréntesis, 2px más pequeña).
    - Se reproduce la pronunciación nativa y una **barra de progreso ascendente** indica el tiempo restante (7.0s) antes de pasar automáticamente a la siguiente tarjeta. Al **tocar cualquier parte de la pantalla**, la barra y el temporizador se detienen de inmediato para permitir leer y estudiar la tarjeta con calma.
    - **Transición Sedosa entre Palabras (Crossfade)**: Al avanzar a la siguiente palabra (manual o automáticamente), `cardTransitionAnim` realiza un fade-out de 140ms (`1 → 0`), conmuta el estado de la palabra en opacidad cero absoluta sin saltos visuales ni elementos partidos, y realiza un fade-in de 140ms (`0 → 1`) a 60 FPS nativos.
    - El panel incluye los botones lado a lado: **"Dominada"** (marcar y excluir esa conjugación específica) y **"Siguiente"** para avanzar.
8. Al terminar todas las palabras de una categoría, se muestra el resumen con opciones limpias: **"Practicar de nuevo"**, **"Practicar todas las formas"** y **"Finalizar"**.

---

## Flujo 4: Gestión y Edición del Mazo de Conjugaciones (Menú de 3 puntos)
1. Dentro de `ConjugationPracticeModal`, en la esquina superior derecha de la cabecera, se ubica el botón de opciones `...` (`moreMenuBtn`).
2. Al tocarlo se despliega el menú con:
   - **Agregar palabras**: Abre un modal con los verbos y adjetivos disponibles para agregar, y una sección de **Conjugaciones dominadas** donde se muestra cada conjugación dominada con su forma conjugada y un botón `[Estudiar]` para reintegrarla.
   - **Eliminar palabras**: Abre un modal con los verbos y adjetivos actualmente activos en la práctica. Al presionar **[Quitar]**, se desactiva `setWordConjugationEnabled(id, false)`, excluyéndola de las conjugaciones sin borrar la palabra de su mazo principal.

---

## Archivos Involucrados
- `lib/japanese-utils.ts` — `classifyJapaneseWord()`, `conjugateJapanese()`, `isJapaneseDictionaryForm()`, `toNormalizedHiragana()`.
- `lib/japanese-search.ts` — `mapJishoPartsOfSpeech()`, parsing de `parts_of_speech` y Furigana.
- `lib/word-service.ts` — `getConjugableWordsForDeck()`, `getAvailableDeckWordsForConjugation()`, `setWordConjugationEnabled()`.
- `src/components/ConjugationPracticeModal.tsx` — Modal interactivo de conjugaciones con menú de 3 puntos y gestión de palabras.
- `src/app/search.tsx` — Detección, badges y diálogo condicional.
- `src/app/deck/[id].tsx` — Menú de mazo con acceso a conjugaciones.
- `src/app/word/[id].tsx` — Ficha de la palabra con categoría y nivel JLPT.
