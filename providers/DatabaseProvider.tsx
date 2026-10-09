import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db, initUserDb, initDictDb } from '../db';
import migrations from '../db/migrations/migrations';
import { backfillMissingReadings, runDataRepair } from '../lib/data-repair';

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    // 1. Base de datos de solo lectura para el diccionario (estática, ~19MB)
    <SQLiteProvider 
      databaseName="dictionary.db" 
      assetSource={{ assetId: require('../assets/cedict/dictionary.db') }}
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
  }, [dictExpoDb]);

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
