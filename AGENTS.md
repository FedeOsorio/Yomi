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
## REGLA — MOTOR DE VOZ (SHERPA-ONNX: REAZONSPEECH + SENSEVOICE)
- Reconocimiento offline con Sherpa-ONNX (`lib/sherpa-service.ts`), un modelo por idioma: **japonés → ReazonSpeech** (zipformer transducer INT8, ~160 MB) y **chino / inglés → SenseVoice-Small** (INT8, ~230 MB). Otros idiomas usan el reconocedor nativo (`expo-speech-recognition`). El único punto de entrada es `lib/speech-recognition-service.ts`.
- **Pistas (hotwords) en japonés:** al cargar ReazonSpeech se le pasan las palabras de TODA la sesión (`expectedVoiceWords` de cada tarjeta, vía `sherpaVoiceService.setVocabulary`). La librería solo acepta pistas al crear el motor (su `setConfig` no las reconstruye), así que NO se cambian tarjeta por tarjeta: recargar cuesta segundos. Pistas de una sola letra/kana no se usan. La pista inclina al modelo hacia la palabra cuando el audio es dudoso (まん en vez de ま) pero no la inventa si no se dijo.
- **Los modelos NO van dentro del APK.** El usuario descarga solo el del idioma que estudia, en `documentDirectory/models/<modelo>`, desde Configuración › Prueba de audio › Reconocimiento de voz (`useVoiceModelStore`). La app NUNCA los descarga sola: si falta, avisa y ofrece ir a Configuración. Se cargan en memoria solo al usarse (nunca al abrir la app).
- **Un intento = una elocución completa.** Sherpa entrega un único resultado final por cada frase seguida de una pausa. En el repaso hay 3 intentos por tarjeta.
- **Evaluación estricta** en `lib/voice-match.ts` (`checkVoiceMatch`): se compara la elocución COMPLETA con la lectura de la tarjeta. Solo se toleran escrituras equivalentes (kanji homófono, katakana, romaji, y は/へ/を escritos donde la palabra lleva わ/え/お: かは = かわ), vocales largas y 1 sonido distinto en palabras de 8+ letras. Única excepción de sonoridad: en lecturas de UNA mora se acepta oír sonora una consonante sorda (こ→ご), nunca al revés. PROHIBIDO agregar otras tolerancias de prefijo/sufijo, partículas, conjugaciones o sonoridad: generan falsos aciertos.
- `plugins/withSherpaOnnx.js` solo fija propiedades de Gradle. No parchear archivos de `node_modules`.
