import { SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as userSchema from './schema';
import * as dictSchema from './dict-schema';

// Base de datos del usuario (mazos, palabras, oraciones, tarjetas SRS)
export let db: ReturnType<typeof drizzle<typeof userSchema>>;

// Base de datos de solo lectura del diccionario (CC-CEDICT)
export let dictDb: ReturnType<typeof drizzle<typeof dictSchema>>;

// Inicializa la base de datos de usuario viva
export function initUserDb(expoDb: SQLiteDatabase) {
  db = drizzle(expoDb, { schema: userSchema });
}

// Inicializa la base de datos de solo lectura del diccionario
export function initDictDb(expoDb: SQLiteDatabase) {
  dictDb = drizzle(expoDb, { schema: dictSchema });
}

// Alias de compatibilidad
export function initGlobalDb(expoDb: SQLiteDatabase) {
  initUserDb(expoDb);
}

