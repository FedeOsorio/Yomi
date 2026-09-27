import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  GoogleUserProfile,
  GoogleDriveBackupMetadata,
  loginWithGoogleAsync,
  disconnectGoogleAccount,
  getValidGoogleAccessToken,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  findDriveBackupFile,
  checkTokenDriveScope,
  getStoredGoogleUser,
  getStoredDriveBackupMeta,
} from '../../lib/google-drive-service';
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from '../../lib/storage-service';
import {
  createFullBackupPackage,
  parseBackupFile,
  restoreBackupPackage,
  YomiFullBackupPackage,
} from '../../lib/backup-service';

// Adaptador de persistencia asíncrono para Zustand conectando con storage-service
const zustandStorageAdapter = {
  getItem: async (name: string): Promise<string | null> => {
    return await getStorageItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await setStorageItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await removeStorageItem(name);
  },
};

export interface GoogleDriveState {
  // Estado
  googleUser: GoogleUserProfile | null;
  driveBackupMeta: GoogleDriveBackupMetadata | null;
  isConnecting: boolean;
  isSyncing: boolean;
  isRestoring: boolean;
  isChecking: boolean;
  hasHydrated: boolean;

  autoBackupEnabled: boolean;
  lastAutoBackupTime: string | null;

  // Acciones
  setGoogleUser: (user: GoogleUserProfile | null) => void;
  setDriveBackupMeta: (meta: GoogleDriveBackupMetadata | null) => void;
  setAutoBackupEnabled: (enabled: boolean) => Promise<void>;
  performSilentAutoBackup: () => Promise<boolean>;
  setHasHydrated: (val: boolean) => void;
  init: () => Promise<void>;
  connect: () => Promise<{
    success: boolean;
    user?: GoogleUserProfile;
    missingDriveScope?: boolean;
    backupMeta?: GoogleDriveBackupMetadata | null;
    error?: string;
  }>;
  disconnect: () => Promise<void>;
  createBackup: () => Promise<{
    success: boolean;
    stats?: YomiFullBackupPackage['metadata'];
    error?: string;
  }>;
  inspectBackup: () => Promise<{
    success: boolean;
    pkg?: YomiFullBackupPackage;
    error?: string;
  }>;
  restoreBackup: (strategy: 'merge' | 'replace', pkg: YomiFullBackupPackage) => Promise<{
    success: boolean;
    res?: { foldersCount?: number; decksCount: number; wordsCount: number };
    error?: string;
  }>;
  refreshMeta: (force?: boolean) => Promise<{
    success: boolean;
    meta?: GoogleDriveBackupMetadata | null;
    error?: string;
  }>;
}

export const useGoogleDriveStore = create<GoogleDriveState>()(
  persist(
    (set, get) => ({
      googleUser: null,
      driveBackupMeta: null,
      autoBackupEnabled: true,
      lastAutoBackupTime: null,
      isConnecting: false,
      isSyncing: false,
      isRestoring: false,
      isChecking: false,
      hasHydrated: false,

      setGoogleUser: (user) => set({ googleUser: user }),
      setDriveBackupMeta: (meta) => set({ driveBackupMeta: meta }),
      setHasHydrated: (val) => set({ hasHydrated: val }),

      setAutoBackupEnabled: async (enabled) => {
        set({ autoBackupEnabled: enabled });
        await setStorageItem('yomi_google_drive_auto_backup_enabled', String(enabled));
        if (enabled && get().googleUser) {
          get().performSilentAutoBackup().catch(() => {});
        }
      },

      init: async () => {
        try {
          const [storedUser, storedMeta, storedAutoBackup, storedLastAuto] = await Promise.all([
            getStoredGoogleUser(),
            getStoredDriveBackupMeta(),
            getStorageItem('yomi_google_drive_auto_backup_enabled'),
            getStorageItem('yomi_google_drive_last_auto_backup_ts'),
          ]);

          const autoEnabled = storedAutoBackup !== null ? storedAutoBackup === 'true' : true;

          set({
            googleUser: storedUser ?? get().googleUser,
            driveBackupMeta: storedMeta ?? get().driveBackupMeta,
            autoBackupEnabled: autoEnabled,
            lastAutoBackupTime: storedLastAuto,
            hasHydrated: true,
          });

          // Si hay usuario vinculado, refrescar metadatos silenciosamente desde Drive
          if (storedUser) {
            get().refreshMeta(false).catch(() => {});
            if (autoEnabled) {
              setTimeout(() => {
                get().performSilentAutoBackup().catch(() => {});
              }, 3000);
            }
          }
        } catch (e) {
          console.warn('[GoogleDriveStore] Init warning:', e);
          set({ hasHydrated: true });
        }
      },

      connect: async () => {
        set({ isConnecting: true });
        try {
          const result = await loginWithGoogleAsync();
          set({
            googleUser: result.profile,
            driveBackupMeta: result.metadata ?? get().driveBackupMeta,
          });

          // Verificar si otorgó el permiso de Drive
          const scopeCheck = await checkTokenDriveScope(result.token);
          const missingDriveScope = scopeCheck.valid && !scopeCheck.hasDriveScope;

          // Si no vino metadata en el login y tiene permiso, consultar de inmediato a Drive
          let meta = result.metadata;
          if (!meta && !missingDriveScope) {
            const refreshed = await get().refreshMeta(true).catch(() => ({ success: false, meta: null }));
            if (refreshed.success && refreshed.meta) {
              meta = refreshed.meta;
            }
          }

          return {
            success: true,
            user: result.profile,
            missingDriveScope,
            backupMeta: meta ?? get().driveBackupMeta,
          };
        } catch (e: any) {
          if (e.message === 'USER_CANCELLED') {
            return { success: false, error: 'USER_CANCELLED' };
          }
          return { success: false, error: e.message || 'Error al iniciar sesión con Google.' };
        } finally {
          set({ isConnecting: false });
        }
      },

      disconnect: async () => {
        try {
          await disconnectGoogleAccount();
        } catch (e) {
          console.warn('[GoogleDriveStore] Disconnect warning:', e);
        } finally {
          set({
            googleUser: null,
            driveBackupMeta: null,
          });
        }
      },

      createBackup: async () => {
        const user = get().googleUser;
        if (!user) {
          return { success: false, error: 'No hay cuenta de Google vinculada.' };
        }

        set({ isSyncing: true });
        try {
          let token: string | null = null;
          try {
            token = await getValidGoogleAccessToken();
          } catch (err: any) {
            console.warn('[GoogleDriveStore] No se pudo obtener token:', err.message);
          }

          // Modo demo / sin token
          if (!token) {
            const pkg = await createFullBackupPackage();
            const nowIso = new Date().toISOString();
            const demoMeta: GoogleDriveBackupMetadata = {
              fileId: 'mock-drive-id',
              name: 'yomi-backup.json',
              modifiedTime: nowIso,
              sizeBytes: new Blob([JSON.stringify(pkg)]).size,
              foldersCount: pkg.metadata.foldersCount,
              decksCount: pkg.metadata.decksCount,
              wordsCount: pkg.metadata.wordsCount,
              srsCount: pkg.metadata.srsCount,
            };
            await setStorageItem('yomi_google_drive_last_backup', JSON.stringify(demoMeta));
            set({ driveBackupMeta: demoMeta });
            return { success: true, stats: pkg.metadata };
          }

          // Subida real a Google Drive
          const res = await uploadBackupToGoogleDrive(token);
          const nowIso = new Date().toISOString();
          await setStorageItem('yomi_google_drive_last_auto_backup_ts', nowIso);
          set({
            driveBackupMeta: res.metadata,
            lastAutoBackupTime: nowIso,
          });
          return { success: true, stats: res.stats };
        } catch (e: any) {
          return {
            success: false,
            error: e.message || 'No se pudo guardar la copia en Google Drive.',
          };
        } finally {
          set({ isSyncing: false });
        }
      },

      inspectBackup: async () => {
        const user = get().googleUser;
        if (!user) {
          return { success: false, error: 'Cuenta no conectada.' };
        }

        set({ isRestoring: true });
        try {
          let token: string | null = null;
          try {
            token = await getValidGoogleAccessToken();
          } catch {}

          let content: string;
          if (token) {
            content = await downloadBackupFromGoogleDrive(token);
          } else {
            const pkg = await createFullBackupPackage();
            content = JSON.stringify(pkg);
          }

          const pkg = parseBackupFile(content);

          // Actualizar metadatos en memoria con los datos reales del paquete
          const meta = get().driveBackupMeta;
          const updatedMeta: GoogleDriveBackupMetadata = {
            fileId: meta?.fileId || 'drive-backup',
            name: meta?.name || 'yomi-backup.json',
            modifiedTime: pkg.createdAt,
            sizeBytes: meta?.sizeBytes || new Blob([content]).size,
            foldersCount: pkg.metadata.foldersCount,
            decksCount: pkg.metadata.decksCount,
            wordsCount: pkg.metadata.wordsCount,
            srsCount: pkg.metadata.srsCount,
          };
          set({ driveBackupMeta: updatedMeta });
          await setStorageItem('yomi_google_drive_last_backup', JSON.stringify(updatedMeta));

          return { success: true, pkg };
        } catch (e: any) {
          return {
            success: false,
            error: e.message || 'No se pudo inspeccionar la copia de seguridad.',
          };
        } finally {
          set({ isRestoring: false });
        }
      },

      restoreBackup: async (strategy, pkg) => {
        set({ isRestoring: true });
        try {
          const res = await restoreBackupPackage(pkg, strategy);
          return { success: true, res };
        } catch (e: any) {
          return {
            success: false,
            error: e.message || 'Error durante la restauración de datos.',
          };
        } finally {
          set({ isRestoring: false });
        }
      },

      refreshMeta: async (force = true) => {
        const user = get().googleUser;
        if (!user) return { success: false, error: 'Sin cuenta vinculada.' };

        set({ isChecking: true });
        try {
          const meta = await findDriveBackupFile(force);
          set({ driveBackupMeta: meta });
          return { success: true, meta };
        } catch (e: any) {
          return {
            success: false,
            error: e.message || 'Error al consultar Google Drive.',
          };
        } finally {
          set({ isChecking: false });
        }
      },

      performSilentAutoBackup: async () => {
        const { googleUser, autoBackupEnabled, isSyncing } = get();
        if (!googleUser || !autoBackupEnabled || isSyncing) {
          return false;
        }

        try {
          const lastBackupStr = await getStorageItem('yomi_google_drive_last_auto_backup_ts');
          const now = Date.now();
          const ONE_DAY_MS = 24 * 60 * 60 * 1000;
          if (lastBackupStr) {
            const lastTime = new Date(lastBackupStr).getTime();
            if (!isNaN(lastTime) && (now - lastTime < ONE_DAY_MS)) {
              return false; // Ya se realizó el respaldo en las últimas 24 horas
            }
          }

          let token: string | null = null;
          try {
            token = await getValidGoogleAccessToken();
          } catch {
            return false;
          }

          if (!token) return false;

          console.log('[GoogleDrive] Ejecutando respaldo automático diario silencioso...');
          const res = await uploadBackupToGoogleDrive(token);
          const nowIso = new Date().toISOString();
          await setStorageItem('yomi_google_drive_last_auto_backup_ts', nowIso);
          set({
            driveBackupMeta: res.metadata,
            lastAutoBackupTime: nowIso,
          });
          return true;
        } catch (err) {
          console.warn('[GoogleDrive] Auto-respaldo silencioso omitido:', err);
          return false;
        }
      },
    }),
    {
      name: 'yomi-google-drive-store',
      storage: createJSONStorage(() => zustandStorageAdapter),
      partialize: (state) => ({
        googleUser: state.googleUser,
        driveBackupMeta: state.driveBackupMeta,
        autoBackupEnabled: state.autoBackupEnabled,
        lastAutoBackupTime: state.lastAutoBackupTime,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
