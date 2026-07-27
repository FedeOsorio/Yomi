// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Permite importar archivos .sql directamente como strings para Drizzle
config.resolver.sourceExts.push('sql');
// Permite empaquetar el archivo .db del diccionario como asset de Expo
config.resolver.assetExts.push('db');

module.exports = config;
