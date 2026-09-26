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

