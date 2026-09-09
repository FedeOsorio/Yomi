# Yomi

A smart spaced repetition flashcard system that replaces Anki with modern technology.

## Table of Contents

- [What is Yomi?](#what-is-yomi)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Dependencies](#dependencies)
- [Quick Start](#quick-start)
- [Available Commands](#available-commands)
- [Project Structure](#project-structure)
- [Privacy](#privacy)
- [License](#license)
- [Versión en Español](#versión-en-español)

## What is Yomi?

Yomi is a mobile-first flashcard app built with React Native that uses the FSRS (Free Spaced Repetition Scheduler) algorithm to optimize when you review cards. Instead of Anki's outdated scheduling, Yomi learns from your responses and adapts to your learning pace.

## Key Features

- **FSRS Algorithm** - Next-generation spaced repetition that adapts to how you learn
- **Voice Practice** - Record and practice pronunciation with AI feedback
- **Mobile First** - Native iOS and Android apps, optimized for learning on the go
- **Offline** - Study anywhere without internet. Your data stays on your device
- **Fast** - SQLite-backed local storage means instant access to your cards
- **Clean Interface** - Modern, distraction-free design focused on learning

## Tech Stack

- React Native + Expo 57
- TypeScript
- SQLite with Drizzle ORM
- ts-fsrs algorithm
- Expo Speech Recognition

## Dependencies

### Core Framework & UI

- [expo](https://github.com/expo/expo) - Open-source platform for building native apps
- [react-native](https://github.com/facebook/react-native) - JavaScript framework for building mobile apps
- [react](https://github.com/facebook/react) - JavaScript library for building user interfaces
- [expo-router](https://github.com/expo/expo/tree/main/packages/expo-router) - File-based routing for React Native

### Database & ORM

- [drizzle-orm](https://github.com/drizzle-team/drizzle-orm) - TypeScript ORM for database access
- [drizzle-kit](https://github.com/drizzle-team/drizzle-kit) - CLI tool for Drizzle migrations
- [expo-sqlite](https://github.com/expo/expo/tree/main/packages/expo-sqlite) - SQLite database module

### Spaced Repetition

- [ts-fsrs](https://github.com/L-M-Sherlock/ts-fsrs) - TypeScript implementation of FSRS algorithm

### Voice & Speech

- [expo-speech-recognition](https://github.com/expo/expo/tree/main/packages/expo-speech-recognition) - Speech recognition API
- [expo-speech](https://github.com/expo/expo/tree/main/packages/expo-speech) - Text-to-speech engine

### Navigation & Gestures

- [react-native-gesture-handler](https://github.com/software-mansion/react-native-gesture-handler) - Gesture recognition library
- [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) - Animation library
- [react-native-screens](https://github.com/software-mansion/react-native-screens) - Native screen components

### UI Components & Icons

- [@expo/ui](https://github.com/expo/expo/tree/main/packages/expo-ui) - UI component library
- [@expo/vector-icons](https://github.com/expo/vector-icons) - Icon library
- [expo-image](https://github.com/expo/expo/tree/main/packages/expo-image) - Image component
- [expo-glass-effect](https://github.com/expo/expo/tree/main/packages/expo-glass-effect) - Glass morphism effects

### Utilities

- [expo-file-system](https://github.com/expo/expo/tree/main/packages/expo-file-system) - File system access
- [expo-document-picker](https://github.com/expo/expo/tree/main/packages/expo-document-picker) - Document picker
- [react-native-svg](https://github.com/software-mansion/react-native-svg) - SVG rendering
- [react-native-safe-area-context](https://github.com/th3rdEye/react-native-safe-area-context) - Safe area handling

## Quick Start

```bash
# Install dependencies
npm install

# Start development
npm start
```

Then open in your iOS simulator, Android emulator, or Expo Go app.

## Available Commands

```bash
npm start              # Start dev server
npm run ios           # Build for iOS
npm run android       # Build for Android
npm run web           # Run on web
npm run build:dictionary    # Build dictionary assets
```

## Project Structure

```
src/          # Main application code
db/           # Database schemas
lib/          # Utilities
assets/       # Images, fonts
constants/    # App constants
providers/    # React providers
scripts/      # Build scripts
```

## Privacy

Your data is yours. Yomi stores everything locally on your device - no cloud, no tracking, no ads.

## License

MIT License - see LICENSE file for details.

---

# Yomi

Un sistema inteligente de tarjetas de repetición espaciada que reemplaza Anki con tecnología moderna.

## Tabla de Contenidos

- [Qué es Yomi?](#qué-es-yomi)
- [Características Principales](#características-principales)
- [Stack Tecnológico](#stack-tecnológico)
- [Dependencias](#dependencias)
- [Inicio Rápido](#inicio-rápido)
- [Comandos Disponibles](#comandos-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Privacidad](#privacidad)
- [Licencia](#licencia)

## Qué es Yomi?

Yomi es una aplicación de tarjetas flash centrada en móvil construida con React Native que utiliza el algoritmo FSRS (Free Spaced Repetition Scheduler) para optimizar cuándo repasas tus tarjetas. En lugar del obsoleto sistema de programación de Anki, Yomi aprende de tus respuestas y se adapta a tu ritmo de aprendizaje.

## Características Principales

- **Algoritmo FSRS** - Repetición espaciada de nueva generación que se adapta a cómo aprendes
- **Práctica de Pronunciación** - Graba y practica pronunciación con retroalimentación de IA
- **Primero en Móvil** - Aplicaciones nativas para iOS y Android, optimizadas para aprender en movimiento
- **Sin Conexión** - Estudia en cualquier lugar sin internet. Tus datos permanecen en tu dispositivo
- **Rápido** - Almacenamiento local con SQLite significa acceso instantáneo a tus tarjetas
- **Interfaz Limpia** - Diseño moderno sin distracciones enfocado en el aprendizaje

## Stack Tecnológico

- React Native + Expo 57
- TypeScript
- SQLite con Drizzle ORM
- Algoritmo ts-fsrs
- Expo Speech Recognition

## Dependencias

### Framework Principal & UI

- [expo](https://github.com/expo/expo) - Plataforma de código abierto para construir aplicaciones nativas
- [react-native](https://github.com/facebook/react-native) - Framework JavaScript para construir aplicaciones móviles
- [react](https://github.com/facebook/react) - Librería JavaScript para construir interfaces de usuario
- [expo-router](https://github.com/expo/expo/tree/main/packages/expo-router) - Enrutamiento basado en archivos para React Native

### Base de Datos & ORM

- [drizzle-orm](https://github.com/drizzle-team/drizzle-orm) - ORM TypeScript para acceso a base de datos
- [drizzle-kit](https://github.com/drizzle-team/drizzle-kit) - Herramienta CLI para migraciones de Drizzle
- [expo-sqlite](https://github.com/expo/expo/tree/main/packages/expo-sqlite) - Módulo de base de datos SQLite

### Repetición Espaciada

- [ts-fsrs](https://github.com/L-M-Sherlock/ts-fsrs) - Implementación en TypeScript del algoritmo FSRS

### Voz & Reconocimiento de Voz

- [expo-speech-recognition](https://github.com/expo/expo/tree/main/packages/expo-speech-recognition) - API de reconocimiento de voz
- [expo-speech](https://github.com/expo/expo/tree/main/packages/expo-speech) - Motor de síntesis de voz

### Navegación & Gestos

- [react-native-gesture-handler](https://github.com/software-mansion/react-native-gesture-handler) - Librería de reconocimiento de gestos
- [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) - Librería de animaciones
- [react-native-screens](https://github.com/software-mansion/react-native-screens) - Componentes de pantalla nativa

### Componentes UI & Iconos

- [@expo/ui](https://github.com/expo/expo/tree/main/packages/expo-ui) - Librería de componentes UI
- [@expo/vector-icons](https://github.com/expo/vector-icons) - Librería de iconos
- [expo-image](https://github.com/expo/expo/tree/main/packages/expo-image) - Componente de imagen
- [expo-glass-effect](https://github.com/expo/expo/tree/main/packages/expo-glass-effect) - Efectos de morfismo de vidrio

### Utilidades

- [expo-file-system](https://github.com/expo/expo/tree/main/packages/expo-file-system) - Acceso al sistema de archivos
- [expo-document-picker](https://github.com/expo/expo/tree/main/packages/expo-document-picker) - Selector de documentos
- [react-native-svg](https://github.com/software-mansion/react-native-svg) - Renderizado SVG
- [react-native-safe-area-context](https://github.com/th3rdEye/react-native-safe-area-context) - Manejo de área segura

## Inicio Rápido

```bash
# Instalar dependencias
npm install

# Iniciar desarrollo
npm start
```

Luego abre en tu simulador de iOS, emulador de Android, o aplicación Expo Go.

## Comandos Disponibles

```bash
npm start              # Iniciar servidor de desarrollo
npm run ios           # Compilar para iOS
npm run android       # Compilar para Android
npm run web           # Ejecutar en web
npm run build:dictionary    # Construir activos del diccionario
```

## Estructura del Proyecto

```
src/          # Código principal de la aplicación
db/           # Esquemas de base de datos
lib/          # Utilidades
assets/       # Imágenes, fuentes
constants/    # Constantes de la aplicación
providers/    # Proveedores de React
scripts/      # Scripts de compilación
```

## Privacidad

Tus datos son tuyos. Yomi almacena todo localmente en tu dispositivo - sin nube, sin rastreo, sin anuncios.

## Licencia

Licencia MIT - ver archivo LICENSE para detalles.
