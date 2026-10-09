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
## REGLA — MOTOR DE VOZ (SHERPA-ONNX / SENSEVOICE-SMALL)
- Japonés, chino e inglés se reconocen offline con **Sherpa-ONNX + SenseVoice-Small (INT8)** (`lib/sherpa-service.ts`). Otros idiomas usan el reconocedor nativo (`expo-speech-recognition`). El único punto de entrada es `lib/speech-recognition-service.ts`.
- **El modelo NO va dentro del APK.** El usuario lo descarga (~230 MB) a `documentDirectory/models/sense-voice` desde Configuración › Prueba de audio › Reconocimiento de voz (`useVoiceModelStore`). La app NUNCA lo descarga sola: si falta, avisa y ofrece ir a Configuración. Se carga en memoria solo al usarse (nunca al abrir la app).
- **Un intento = una elocución completa.** Sherpa entrega un único resultado final por cada frase seguida de una pausa. En el repaso hay 3 intentos por tarjeta.
- **Evaluación estricta** en `lib/voice-match.ts` (`checkVoiceMatch`): se compara la elocución COMPLETA con la lectura de la tarjeta. Solo se toleran escrituras equivalentes (kanji homófono, katakana, romaji), vocales largas y 1 sonido distinto en palabras de 8+ letras. Única excepción de sonoridad: en lecturas de UNA mora se acepta oír sonora una consonante sorda (こ→ご), nunca al revés. PROHIBIDO agregar otras tolerancias de prefijo/sufijo, partículas, conjugaciones o sonoridad: generan falsos aciertos.
- `plugins/withSherpaOnnx.js` solo fija propiedades de Gradle. No parchear archivos de `node_modules`.
