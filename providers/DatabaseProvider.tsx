import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db, initGlobalDb } from '../db';
import migrations from '../db/migrations/migrations';

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    // Expo SQLiteProvider automáticamente se encarga de:
    // 1. Crear el archivo de base de datos si no existe.
    // 2. Si definimos assetSource, lo copia al dispositivo la primera vez.
    // 3. Proveer la conexión a través del hook useSQLiteContext.
    <SQLiteProvider 
      databaseName="yomi.db" 
      assetSource={{ assetId: require('../assets/cedict/dictionary.db') }}
    >
      <InnerProvider>{children}</InnerProvider>
    </SQLiteProvider>
  );
};

const InnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const expoDb = useSQLiteContext();
  
  // 1. Inicializar la instancia global de Drizzle síncronamente antes de las migraciones
  React.useMemo(() => {
    initGlobalDb(expoDb);
  }, [expoDb]);

  // 2. Correr migraciones sobre la base de datos
  const { success: migrationsReady, error: migrationsError } = useMigrations(db, migrations);

  if (migrationsError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Error en migraciones: {migrationsError.message}
        </Text>
      </View>
    );
  }

  if (!migrationsReady) {
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
