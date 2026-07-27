import { SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as userSchema from './schema';
import * as dictSchema from './dict-schema';

const fullSchema = { ...userSchema, ...dictSchema };

// Base de datos global unificada
export let db: ReturnType<typeof drizzle<typeof fullSchema>>;

// Se llama desde el DatabaseProvider una vez que Expo provee la conexión SQLite
export function initGlobalDb(expoDb: SQLiteDatabase) {
  db = drizzle(expoDb, { schema: fullSchema });
}
