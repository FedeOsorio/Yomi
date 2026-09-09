# Yomi

A smart spaced repetition flashcard system that replaces Anki with modern technology.

## Table of Contents

- [What is Yomi?](#what-is-yomi)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Dictionary Data & Resources](#dictionary-data--resources)
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

## Dictionary Data & Resources

Yomi uses open-source dictionary databases for language learning:

### Chinese

- **CC-CEDICT (MDBG)** - Open source Chinese dictionary database containing Hanzi characters, Pinyin romanization, and English definitions. Compiled into `assets/cedict/cedict_ts.u8`
  - [CC-CEDICT Repository](https://github.com/MDBG/cc-cedict)
  - [MDBG Chinese Tools](https://www.mdbg.net/chinese/dictionary)

### Japanese

- **JMdict** - Comprehensive Japanese-English dictionary by the Electronic Dictionary R&D Group
  - [EDRDG JMdict](http://www.edrdg.org/jmdict/j_jmdict.html)
  
- **KANJIDIC2** - Kanji character and radical database
  - [EDRDG KANJIDIC2](http://www.edrdg.org/kanjidic/kanjidic2.html)

- **Kradfile/Radicals** - Kanji radicals data by Michael Radford
  - [EDRDG Kradfile](http://www.edrdg.org/kradfile/kradinf.html)

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
assets/       # Images, fonts, dictionary data
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
- [Datos de Diccionario & Recursos](#datos-de-diccionario--recursos)
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

## Datos de Diccionario & Recursos

Yomi utiliza bases de datos de diccionarios de código abierto para el aprendizaje de idiomas:

### Chino

- **CC-CEDICT (MDBG)** - Base de datos de diccionario chino de código abierto que contiene caracteres Hanzi, romanización Pinyin y definiciones en inglés. Compilada en `assets/cedict/cedict_ts.u8`
  - [Repositorio CC-CEDICT](https://github.com/MDBG/cc-cedict)
  - [MDBG Herramientas Chinas](https://www.mdbg.net/chinese/dictionary)

### Japonés

- **JMdict** - Diccionario completo japonés-inglés del Electronic Dictionary R&D Group
  - [EDRDG JMdict](http://www.edrdg.org/jmdict/j_jmdict.html)
  
- **KANJIDIC2** - Base de datos de caracteres Kanji y radicales
  - [EDRDG KANJIDIC2](http://www.edrdg.org/kanjidic/kanjidic2.html)

- **Kradfile/Radicales** - Datos de radicales Kanji de Michael Radford
  - [EDRDG Kradfile](http://www.edrdg.org/kradfile/kradinf.html)

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
assets/       # Imágenes, fuentes, datos de diccionario
constants/    # Constantes de la aplicación
providers/    # Proveedores de React
scripts/      # Scripts de compilación
```

## Privacidad

Tus datos son tuyos. Yomi almacena todo localmente en tu dispositivo - sin nube, sin rastreo, sin anuncios.

## Licencia

Licencia MIT - ver archivo LICENSE para detalles.
