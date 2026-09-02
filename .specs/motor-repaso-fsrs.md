# Caso de Uso: Motor de Repaso SRS con Verificación Activa y FSRS

## Descripción
Permite al usuario estudiar y repasar diariamente sus tarjetas mediante un cuestionario de verificación activa (Active Recall). El usuario escribe la lectura fonética (pinyin/romaji) y/o el significado en español; el sistema valida objetivamente las respuestas, proporciona retroalimentación instantánea con audio nativo y recalcula automáticamente la estabilidad y la próxima fecha de repaso usando el algoritmo FSRS v5 (`ts-fsrs`).

## Actores
- Usuario que realiza su sesión diaria de estudio.

## Precondiciones
- Existen tarjetas registradas en la tabla `srs_items`.
- Las funciones de validación fonética y semántica están disponibles en `lib/srs-engine.ts`.

## Flujo Principal
1. El usuario ingresa a la pestaña **Repaso** ([src/app/(tabs)/review.tsx](file:///e:/Yomi/src/app/%28tabs%29/review.tsx)) o toca el botón **"Repasar"** en la cabecera de un mazo específico ([src/app/deck/[id].tsx](file:///e:/Yomi/src/app/deck/%5Bid%5D.tsx)).
2. **Selección Visual de Mazos - Repetición Espaciada (Cuadrícula)**:
   - Si no se especificó un mazo, se presenta la vista `"Repetición Espaciada"` con subtítulo `"Elige un mazo para enfocar tu estudio o repasa todos juntos"` y una cuadrícula visual de 2 columnas con tarjetas cuadradas ("cuadraditos") para cada mazo, ajustada directamente bajo la cabecera superior:
     - Bandera del idioma en círculo destacado.
     - Indicador dinámico de estado: `X hoy` (pendientes) o `✓ Al día`.
     - Nombre del mazo, idioma y conteo de palabras.
   - Si existen tarjetas pendientes en múltiples mazos, se presenta una tarjeta hero destacada **"⚡ Repasar Todos los Mazos"**.
3. **Selector de Método de Estudio**:
   - Al tocar cualquier mazo o el banner de repasar todos, se despliega un modal interactivo:
     - ✍️ **Modo Clásico (Escritura activa)**: Active recall escribiendo la pronunciación y significado.
     - 🎙️ **Modo Manos Libres (Voz y Micrófono continuo)**: Pronunciación en voz alta con avance y reapertura automática del micrófono.
   - **Detección de Modo Oficial vs Práctica Libre**:
     - Si el mazo tiene tarjetas pendientes (`dueCount > 0`), se ejecuta en **Modo Oficial SRS** actualizando el algoritmo FSRS v5 (`processCardReview`).
     - **Intervalos Diarios FSRS (Sin pasos en minutos intra-día)**: Se configura FSRS con `enable_short_term: false` (`LongTermScheduler`), eliminando los pasos cortos de 1 minuto y 10 minutos que hacían reaparecer las tarjetas inmediatamente. Al calificar una tarjeta hoy, `due` queda garantizado para el día siguiente (`now + >= 24h`), dejando el mazo al día por el resto de la jornada.
     - Si el mazo está al día (`dueCount === 0`) o el usuario pulsa **"Practicar todo el mazo libremente"** al finalizar: se ejecuta en **Modo Práctica Libre** (`getAllCardsForPractice(deckId)` con filtrado estricto SQL por mazo), permitiendo repasar todo el mazo cuantas veces desee sin alterar los intervalos matemáticos del FSRS. En la interfaz se muestra limpio como `✓ Mazo al día • Modo Práctica Libre`.
4. **Ciclo de Estudio en Modo Manos Libres (Micrófono)**:
   - **Diseño de Interfaz Flotante y Minimalista**: Se oculta la barra inferior de navegación (tab bar) durante la sesión de repaso. El texto interpretado flota libremente arriba de la tarjeta de la pregunta. El micrófono está rodeado por un anillo SVG continuo a 60 FPS (`AnimatedCircle`) con duración calibrada de 15 segundos.
   - **Streaming y Transcripción en Vivo**: Mediante `EXTRA_PARTIAL_RESULTS: true` e `interimResults: true`, la voz del usuario se transcribe y va adaptando en tiempo real sílaba a sílaba mientras habla, sin esperar silencios ni pausas finales.
   - **Acumulación Inteligente de Enunciados (Concatenación por Pausas)**: Si el usuario pronuncia palabras compuestas o largas haciendo pausas naturales (ej. *"onegai"* — pausa de 2s — *"shimasu"*), el reconocedor acumula de forma continua los segmentos mediante `accumulatedSpeechRef` en vez de sobrescribirlos. El motor evalúa la cadena completa unida (*"onegai shimasu"* -> *"おねがいします"*), permitiendo validar el término con total flexibilidad para el ritmo del habla humana.
   - **Transcripción de Voz con Estilo Ruby Dinámico**: A medida que habla, lo pronunciado se adapta inmediatamente en Hiragana o Katakana, mostrando los Kanjis correspondientes en la parte superior estilo Ruby (`rubySpokenKanji`).
   - **Previsualización de Voz en Vivo**: Al detectar la pronunciación correcta, la transcripción se plasma visiblemente en pantalla durante 600ms antes de que la app confirme el acierto y dispare la animación.
   - **Estabilidad Absoluta de Layout (Zero Reflow)**: Los 3 bloques verticales principales (`floatingTranscriptArea` con 60px, `flipContainer` con 290px y `voiceFloatingContainer` con 155px) poseen dimensiones fijas exactas y permanecen siempre montados en el flujo visual (usando transiciones de opacidad en vez de desmontaje condicional). Esto garantiza que los contenedores nunca se muevan, salten ni se desplacen de posición en la pantalla al hablar o cambiar de estado.
   - **Transición Suave 3D al Avanzar**: Al pasar a la siguiente tarjeta (automáticamente tras 10s o al pulsar "Siguiente tarjeta ya"), la tarjeta rota suavemente de regreso a 0° en 320ms con curva cúbica, actualizando el contenido en el punto medio invisible (160ms), brindando un pase de página continuo, natural y sedoso sin cortes bruscos.
   - **Giro 3D de Tarjeta (Flip Card) Universal**: La tarjeta siempre gira en 3D sobre su eje Y tanto al **acertar** como al **fallar** o presionar **"No lo sé"**. En el reverso, justo debajo del badge de resultado ("¡Correcto!" o "Respuesta Incorrecta"), se exhibe el **Kanji de la palabra guardada en tamaño GRANDE (38px)** (`flipHeroWordLarge`), acompañado de la **transcripción fonética en Hiragana/Pinyin en tamaño más chico (18px)** (`flipHeroReadingSmall`) en la parte superior como guía de lectura, junto a los significados seleccionados. Se omiten las palabras compuestas para mantener la cara de corrección limpia.
   - **Duración de Exposición de 10 Segundos**: Al darse vuelta la tarjeta, permanece visible durante 10 segundos para permitir asimilar la respuesta antes del avance automático, pudiendo el usuario pulsar "Siguiente tarjeta ya" para saltar la espera.
   - **Tipografía Homogénea de Tamaño Fijo (38px)**: Todas las palabras se renderizan con un tamaño fijo consistente de 38px, asegurando que los términos entren completos en su contenedor sin achicarse en exceso ni verse desproporcionados respecto a los demás.
5. **Ciclo de Estudio en Modo Clásico (Teclado)**:
   - El usuario tipea la lectura y el significado, comprobando con active recall. Al presionar "Comprobar" o "No me acuerdo", la tarjeta también gira en 3D revelando el reverso con el resultado y la información completa.
6. **Selección Personalizada de Significados por Palabra**:
   - En la vista de detalle de cada palabra guardada (`src/app/word/[id].tsx`), el usuario dispone de selectores interactivos para incluir o excluir qué acepciones desea estudiar.
   - La selección se persiste en `srs_items.displayMeaning` y en `words.auxiliaryInfo`.
   - En el repaso SRS, `review.tsx` resuelve prioritariamente los `selectedMeanings` desde `words.auxiliaryInfo` y `srs_items.displayMeaning`, garantizando que en el reverso de la tarjeta se exhiban exclusivamente las acepciones seleccionadas por el usuario y nunca la lista completa de definiciones si hubo una selección previa.

## Archivos Involucrados
- `src/app/(tabs)/review.tsx` — Pantalla de estudio interactivo, Flip 3D, ocultación de tab bar y máquina de estados de voz.
- `src/app/word/[id].tsx` — Detalle de palabra y selector interactivo de significados para repaso SRS.
- `lib/word-service.ts` — `updateWordSelectedMeanings`, palabras compuestas y gestión de vocabulario.
- `lib/speech-recognition-service.ts` — Abstracción y listeners para `expo-speech-recognition`.
- `lib/srs-engine.ts` — Mapeo de dígitos (`formatSpokenTranscript`), validadores (`checkVoiceMatch`), `getDueCards` y FSRS v5.
- `db/schema.ts` — Tablas `words`, `decks` y `srs_items`.
