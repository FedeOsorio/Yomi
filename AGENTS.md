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
## REGLA — MOTOR DE VOZ OFFLINE (VOSK / KALDI): GRAMÁTICA CERRADA MORFOLÓGICA OBLIGATORIA
- **PROHIBIDO** utilizar el motor de Vosk en modo vocabulario abierto (`open-vocabulary` / sin gramática) en sesiones de repaso o práctica.
  - En silencio o ruido ambiente, el modelo japonés libre de Kaldi CSJ alucina muletillas conversacionales (`あの`, `えー`, `という`, etc.), escribe frases fantasma y gatilla falsos fallos en las tarjetas.
- **ARQUITECTURA OBLIGATORIA:** Toda sesión con Vosk DEBE operar siempre con **gramática cerrada (`voskGrammar`)**:
  1. **Segmentación Morfológica por Espacios:** El diccionario de Kaldi (`words.txt`) está tokenizado morfológicamente. Los compuestos (`千円`, `学生`, `百円`) NO existen unidos en `words.txt`. Deben inyectarse con sus morfemas separados por espacios (`"千 円"`, `"せん えん"`, `"学 生"`, `"がく せい"`, `"百 円"`, `"ひゃく えん"`).
  2. **Filtrado Total de `[unk]`:** El token `[unk]` es el sumidero de rechazo de ruido/silencio de Kaldi. **JAMÁS** debe enviarse a la UI, no debe evaluarse como respuesta errónea ni debe detener el micrófono. El silencio y ruido ambiental se descartan silenciosamente.
  3. **Reinicio Asíncrono Limpio por Tarjeta:** En cada cambio de tarjeta, debe esperarse `await speechService.abort()` antes de la transición, resetear el estado de escucha (`isListening: false`, `speechStatus: 'idle'`, `speechTranscript: ''`), y recrear el reconocedor con la gramática cerrada exclusiva de la nueva tarjeta.
  4. **Tolerancia a Pausas:** Si una pronunciación no coincide mientras el temporizador (15s) sigue corriendo, el micrófono permanece abierto para permitir reintentar o completar la palabra sin abortar prematuramente la tarjeta.
