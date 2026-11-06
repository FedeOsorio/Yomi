import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { deleteDatabaseAsync, SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db, initUserDb, initDictDb } from '../db';
import migrations from '../db/migrations/migrations';
import { backfillMissingReadings, runDataRepair } from '../lib/data-repair';
import { setChineseDictionaryLookup, setDictionaryLookup } from '../lib/phonetic-dictionary';

/** Nombre de la copia del diccionario en el teléfono (cambia con cada versión de su contenido). */
const DICTIONARY_DB = 'dictionary-v2.db';
const OLD_DICTIONARY_DBS = ['dictionary.db'];

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    // 1. Base de datos de solo lectura para los diccionarios (estática, ~24 MB): chino (CC-CEDICT) y japonés
    //    (JMdict). Se copia al teléfono una sola vez: si cambia su contenido hay que cambiarle el nombre
    //    (ver scripts/build-japanese-dictionary.ts)
    <SQLiteProvider
      databaseName={DICTIONARY_DB}
      assetSource={{ assetId: require('../assets/cedict/dictionary-v2.db') }}
    >
      <DictInitProvider>
        {/* 2. Base de datos viva del usuario (mazos, palabras, SRS, <100KB) */}
        <SQLiteProvider databaseName="user_data.db">
          <InnerProvider>{children}</InnerProvider>
        </SQLiteProvider>
      </DictInitProvider>
    </SQLiteProvider>
  );
};

const DictInitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dictExpoDb = useSQLiteContext();

  React.useMemo(() => {
    initDictDb(dictExpoDb);
    // La evaluación por voz conoce así la lectura de cualquier palabra común que escriba el reconocedor
    setDictionaryLookup((word) =>
      dictExpoDb
        .getAllSync<{ hiragana: string }>('SELECT DISTINCT hiragana FROM japanese_dictionary_entries WHERE kanji = ?', [word])
        .map((row) => row.hiragana)
    );
    // Lo mismo en chino: el pinyin de lo que escribió el reconocedor (homófonos con el mismo tono)
    setChineseDictionaryLookup((word) =>
      dictExpoDb
        .getAllSync<{ pinyin_numeric: string }>(
          'SELECT DISTINCT pinyin_numeric FROM dictionary_entries WHERE simplified = ? OR traditional = ?',
          [word, word]
        )
        .map((row) => row.pinyin_numeric)
    );
  }, [dictExpoDb]);

  // Copias de versiones anteriores del diccionario que quedaron en el teléfono (ya no se abren)
  useEffect(() => {
    for (const name of OLD_DICTIONARY_DBS) deleteDatabaseAsync(name).catch(() => {});
  }, []);

  return <>{children}</>;
};

const InnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userExpoDb = useSQLiteContext();
  
  // Inicializar Drizzle para datos de usuario síncronamente antes de las migraciones
  React.useMemo(() => {
    initUserDb(userExpoDb);
  }, [userExpoDb]);

  // Correr migraciones exclusivamente sobre user_data.db
  const { success: migrationsReady, error: migrationsError } = useMigrations(db, migrations);
  // Reparaciones de datos de una sola vez (ver lib/data-repair.ts): la app espera a que terminen
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (migrationsReady) {
      (async () => {
        await runDataRepair();
        setDataReady(true);
        // Puede usar internet: en segundo plano, sin bloquear la app
        backfillMissingReadings();
      })();
    }
  }, [migrationsReady, userExpoDb]);

  if (migrationsError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Error en migraciones: {migrationsError.message}
        </Text>
      </View>
    );
  }

  if (!migrationsReady || !dataReady) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Inicializando base de datos...</Text>
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0D17',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});
