# Reglas del Proyecto Yomi

## REGLA — NO USAR COMANDOS DE GIT
- **PROHIBIDO** ejecutar comandos de git (`git status`, `git diff`, `git log`, `git add`, `git commit`, `git checkout`, `git stat`, etc.).
- El control de versiones es gestionado exclusivamente por el usuario.
- No correr comandos de git para verificar estado, cambios ni diffs; proceder directamente con el código, compilación y pruebas sin interactuar con git.

## REGLA — USAR DEPENDENCIAS ACTUALIZADAS Y MODERNAS (NO HERRAMIENTAS OBSOLETAS)
- **PROHIBIDO** utilizar APIs, módulos o herramientas obsoletas/legacy (como el módulo antiguo `Animated` de `react-native`, o timers manuales de JS `setTimeout` para coordinar animaciones) cuando el proyecto ya cuenta con dependencias modernas y potentes como **`react-native-reanimated` (v4+)**.
- Utilizar siempre `react-native-reanimated` y `react-native-gesture-handler` para micro-interacciones, transiciones de pantalla, modales y layouts en el UI thread.
- Utilizar las Layout Animations nativas de Reanimated (`entering`, `exiting`, `layout={LinearTransition}`) para chips, reordenamientos y filtros de listas.
- Respetar la New Architecture de React Native (React 19 / Expo 57) y no reinventar la rueda con hacks manuales.
## REGLA — SIN EVALUACIÓN POR VOZ
- **Yomi no evalúa pronunciación.** Se quitaron el repaso por voz, la voz en la práctica de conjugaciones y el motor offline (Sherpa-ONNX): con palabras cortas y kanji sueltos el reconocimiento no era confiable. La verificación de pronunciación se hará en Kanji Love. PROHIBIDO volver a agregar reconocimiento de voz para evaluar respuestas en Yomi.
- **El repaso de los mazos de idioma es solo escrito** (modo clásico). En japonés, la ventana de inicio ofrece el repaso o la práctica de conjugaciones; los demás mazos empiezan directo.
- **Único uso del micrófono:** el dictado del formulario de tarjetas personalizadas, con el reconocedor del teléfono (`lib/speech-recognition-service.ts`, expo-speech-recognition).
- **La práctica de conjugaciones** es una máquina de estados pura en `lib/practice-flow.ts` (la ejecuta `src/components/ConjugationPracticeModal.tsx`; prueba: `npm run test:practice`). La respuesta escrita se evalúa con `matchesConjugationAnswer` (`lib/answer-match.ts`): en una forma conjugada no se tolera duración de vocales, っ ni un sonido distinto (いて ≠ いって, きて ≠ きいて); solo escrituras equivalentes (kanji homófono, katakana, romaji, cifras, おう/おお, ぢ/づ = じ/ず, は/へ/を) y las formas equivalentes de `equivalentConjugations` (じゃ = では, じゃありません = じゃないです, くないです = くありません, en verbos なくて = ないで). PROHIBIDO agregar otras tolerancias: generan falsos aciertos.
- Antes de cada OTA, y después de tocar las conjugaciones o su evaluación, correr `npm run test:conjugation` y `npm run test:practice`: los dos deben dar "Todo bien".
- PROHIBIDO editar `node_modules` a mano (sin parches).
