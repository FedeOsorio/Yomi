# Caso de Uso: Motor de Repaso SRS con Verificación Activa y FSRS

## Descripción
Permite al usuario estudiar y repasar diariamente sus tarjetas mediante un cuestionario de verificación activa (Active Recall). El usuario escribe la lectura fonética (pinyin/romaji) y/o el significado en español; el sistema valida objetivamente las respuestas, proporciona retroalimentación instantánea con audio nativo y recalcula automáticamente la estabilidad y la próxima fecha de repaso usando el algoritmo FSRS v5 (`ts-fsrs`).

## Actores
- Usuario que realiza su sesión diaria de estudio.

## Precondiciones
- Existen tarjetas registradas en la tabla `srs_items`.
- Las funciones de validación fonética y semántica están disponibles en `lib/srs-engine.ts`.

## Flujo Principal
1. El usuario ingresa a la pestaña **Repaso** ([src/app/(tabs)/review.tsx](file:///e:/Yomi/src/app/%28tabs%29/review.tsx)).
2. El sistema ejecuta `getDueCards()` y carga todas las tarjetas con `due <= ahora`.
3. Si no hay tarjetas pendientes:
   - Se muestra la pantalla de felicitaciones "¡Todo al día!" con accesos directos para volver a comprobar o agregar vocabulario.
4. Si hay tarjetas pendientes:
   - Se muestra la tarjeta de reto con el carácter/palabra y botón de audio.
   - En idiomas ideográficos (Chino/Japonés):
     - Campo 1: Fonética / Lectura (ej. `xue`).
     - Campo 2: Significado en español (ej. `aprender`).
   - En idiomas alfabéticos (Español/Inglés):
     - Campo: Significado / Traducción.
5. El usuario puede:
   - **Pulsar "Comprobar"**: El sistema evalúa con `checkReadingMatch()` y `checkMeaningMatch()`.
   - **Pulsar "No me acuerdo"**: El sistema califica como fallo directo (`Rating.Again`).
6. El sistema muestra la retroalimentación:
   - Reproducción automática del audio nativo vía `speakText`.
   - Indicador de estado: ✅ Correcto, ⚡ Parcial o ❌ Incorrecto.
   - Comparativa de la respuesta del usuario vs la respuesta esperada.
   - 2-3 palabras compuestas de ejemplo para fijar el concepto.
   - Mapeo automático de calificación FSRS:
     - Acertó fonética y significado $\rightarrow$ `Rating.Good`.
     - Acertó una de las dos $\rightarrow$ `Rating.Hard`.
     - Falló ambas o no recordó $\rightarrow$ `Rating.Again`.
7. El usuario pulsa **"Siguiente tarjeta"**:
   - `processCardReview(cardId, rating)` persiste el nuevo estado en SQLite.
   - Se avanza a la siguiente tarjeta del mazo o se muestra la pantalla de finalización.

## Archivos Involucrados
- `src/app/(tabs)/review.tsx` — Pantalla de estudio interactivo.
- `lib/srs-engine.ts` — Validadores (`checkReadingMatch`, `checkMeaningMatch`, `calculateReviewRating`), motor FSRS y consultas.
- `lib/audio-service.ts` — Reproducción TTS con `expo-speech`.
- `lib/word-service.ts` — Consulta de palabras compuestas contextuales.
- `db/schema.ts` — Tabla `srs_items`.
