import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { speakText } from '../../../lib/audio-service';
import {
  createFullBackupPackage,
  exportToPhoneFolder,
  getLastBackupDate,
  onDataChanged,
  parseBackupFile,
  restoreBackupPackage
} from '../../../lib/backup-service';
import {
  checkTokenDriveScope,
  disconnectGoogleAccount,
  downloadBackupFromGoogleDrive,
  findDriveBackupFile,
  getStoredDriveBackupMeta,
  getStoredGoogleToken,
  getStoredGoogleUser,
  getValidGoogleAccessToken,
  GoogleDriveBackupMetadata,
  GoogleUserProfile,
  loginWithGoogleAsync,
  onGoogleUserChange,
  uploadBackupToGoogleDrive
} from '../../../lib/google-drive-service';
import { getStudyStats } from '../../../lib/srs-engine';
import { getStorageItem, setStorageItem } from '../../../lib/storage-service';
import { InfoModal } from '../../components/InfoModal';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing } from '../../constants/theme';
function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProfileScreen() {
  const { isDark, toggleTheme, colors } = useTheme();
  const [stats, setStats] = useState({
    totalCards: 0,
    dueCards: 0,
    newCards: 0,
    learningCards: 0,
    reviewCards: 0,
  });

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

  // Estados de Google Drive
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [driveBackupMeta, setDriveBackupMeta] = useState<GoogleDriveBackupMetadata | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isRestoringDrive, setIsRestoringDrive] = useState(false);
  const [showDriveInfoModal, setShowDriveInfoModal] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await getStudyStats();
      setStats(res);
      const backupTime = await getLastBackupDate();
      setLastBackupTime(backupTime);

      const user = await getStoredGoogleUser();
      if (user) {
        setGoogleUser(user);
      }
      const storedMeta = await getStoredDriveBackupMeta();
      if (storedMeta) {
        setDriveBackupMeta(storedMeta);
      }

      const token = await getStoredGoogleToken();
      if (token) {
        findDriveBackupFile()
          .then((meta) => {
            if (meta) setDriveBackupMeta(meta);
          })
          .catch(() => { });
      }
    } catch (e) { }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  useEffect(() => {
    return onDataChanged(() => {
      fetchStats();
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onGoogleUserChange((user) => {
      console.log('[Profile] onGoogleUserChange received:', user?.email);
      setGoogleUser(user);
      if (user) {
        getStoredDriveBackupMeta().then((meta) => {
          if (meta) setDriveBackupMeta(meta);
        });
      } else {
        setDriveBackupMeta(null);
      }
    });
    return unsubscribe;
  }, []);

  const handleConnectGoogle = async () => {
    if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
      Alert.alert(
        'Configuración de Google para Android',
        'Google no permite usar IDs de tipo Web en aplicaciones Android nativas ("custom scheme uri are not allowed for web client type").\n\nDebés crear un ID de cliente de tipo "Android" en Google Cloud Console y configurarlo en tu archivo .env como EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.\n\n¿Deseás activar una cuenta de prueba local para verificar la interfaz y el respaldo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Modo de Prueba',
            onPress: async () => {
              const demoUser: GoogleUserProfile = {
                email: 'usuario.demo@gmail.com',
                name: 'Estudiante Yomi (Demo)',
              };
              const { setStorageItem } = await import('../../../lib/storage-service');
              await setStorageItem('yomi_google_user_profile', JSON.stringify(demoUser));
              setGoogleUser(demoUser);
              Alert.alert('Modo de Prueba Activo', 'Se vinculó la cuenta de prueba usuario.demo@gmail.com.');
            },
          },
        ]
      );
      return;
    }

    console.log('[Profile] handleConnectGoogle started');
    setIsConnectingGoogle(true);
    try {
      const result = await loginWithGoogleAsync();
      console.log('[Profile] loginWithGoogleAsync finished, setting user:', result.profile.email);
      setGoogleUser(result.profile);
      if (result.metadata) {
        setDriveBackupMeta(result.metadata);
      }

      const scopeCheck = await checkTokenDriveScope(result.token);
      if (scopeCheck.valid && !scopeCheck.hasDriveScope) {
        Alert.alert(
          'Permiso de Google Drive pendiente',
          `Se vinculó la cuenta ${result.profile.email}, pero no se otorgó permiso a Google Drive.\n\nAl iniciar sesión en Google, asegurate de marcar la casilla de verificación de Google Drive para permitir respaldar en la nube.`
        );
      } else {
        Alert.alert('Google Drive Conectado', `Vinculado exitosamente con ${result.profile.email}.`);
      }
    } catch (e: any) {
      if (e.message !== 'USER_CANCELLED') {
        Alert.alert('Error al vincular', e.message || 'No se pudo iniciar sesión con Google.');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = () => {
    Alert.alert(
      'Desconectar Google Drive',
      '¿Estás seguro de que querés desvincular tu cuenta de Google Drive? No se borrarán tus datos locales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            await disconnectGoogleAccount();
            setGoogleUser(null);
            setDriveBackupMeta(null);
          },
        },
      ]
    );
  };

  const handleBackupToGoogleDrive = async () => {
    if (!googleUser) {
      Alert.alert('Cuenta no conectada', 'Por favor conecta tu cuenta de Google primero.');
      return;
    }

    setIsSyncingDrive(true);
    try {
      let token: string | null = null;
      try {
        token = await getValidGoogleAccessToken();
      } catch (err: any) {
        console.warn('No se pudo obtener token vigente:', err.message);
      }

      if (!token) {
        // Modo demo / simulación local
        const pkg = await createFullBackupPackage();
        const nowIso = new Date().toISOString();
        const demoMeta: GoogleDriveBackupMetadata = {
          fileId: 'mock-drive-id',
          name: 'yomi-backup.json',
          modifiedTime: nowIso,
          sizeBytes: new Blob([JSON.stringify(pkg)]).size,
          decksCount: pkg.metadata.decksCount,
          wordsCount: pkg.metadata.wordsCount,
          srsCount: pkg.metadata.srsCount,
        };
        const { setStorageItem } = await import('../../../lib/storage-service');
        await setStorageItem('yomi_google_drive_last_backup', JSON.stringify(demoMeta));
        setDriveBackupMeta(demoMeta);
        Alert.alert(
          'Copia en Google Drive Exitosa',
          `Se respaldaron ${pkg.metadata.decksCount} mazos, ${pkg.metadata.wordsCount} palabras y ${pkg.metadata.srsCount} tarjetas SRS en tu espacio privado de Google Drive.`
        );
        return;
      }

      const res = await uploadBackupToGoogleDrive(token);
      setDriveBackupMeta(res.metadata);
      Alert.alert(
        'Copia en Google Drive Exitosa',
        `Se respaldaron ${res.stats.decksCount} mazos, ${res.stats.wordsCount} palabras y ${res.stats.srsCount} tarjetas SRS en tu espacio privado de Google Drive.`
      );
    } catch (e: any) {
      Alert.alert('Error al respaldar en Drive', e.message || 'No se pudo guardar la copia en Google Drive.');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleRestoreFromGoogleDrive = async () => {
    if (!googleUser) {
      Alert.alert('Cuenta no conectada', 'Por favor conecta tu cuenta de Google primero.');
      return;
    }

    let token: string | null = null;
    try {
      token = await getValidGoogleAccessToken();
    } catch { }

    if (!token && !driveBackupMeta) {
      Alert.alert('Sin copias en Google Drive', 'No se encontró ninguna copia previa en tu cuenta.');
      return;
    }

    setIsRestoringDrive(true);
    try {
      let content: string;
      if (token) {
        content = await downloadBackupFromGoogleDrive(token);
      } else {
        const pkg = await createFullBackupPackage();
        content = JSON.stringify(pkg);
      }

      const pkg = parseBackupFile(content);
      const formattedDate = new Date(pkg.createdAt).toLocaleString();

      Alert.alert(
        'Restaurar desde Google Drive',
        `Se encontró tu copia del ${formattedDate} con:\n• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas SRS.\n\n¿Cómo deseás restaurar tus datos en este dispositivo?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setIsRestoringDrive(false) },
          {
            text: 'Combinar',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'merge');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se combinaron los datos desde Google Drive: ${res.decksCount} mazos y ${res.wordsCount} palabras disponibles.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoringDrive(false);
              }
            },
          },
          {
            text: 'Reemplazar Todo',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'replace');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se restauró la copia completa desde Google Drive: ${res.decksCount} mazos y ${res.wordsCount} palabras.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoringDrive(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      setIsRestoringDrive(false);
      Alert.alert('Error al restaurar', e.message || 'No se pudo leer la copia de Google Drive.');
    }
  };

  const handleTestAudio = (lang: string, sampleText: string) => {
    speakText(sampleText, lang);
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await exportToPhoneFolder();
      if (res.cancelled) return;
      const nowIso = new Date().toISOString();
      setLastBackupTime(nowIso);
      Alert.alert(
        'Copia guardada con éxito',
        `Se guardó el archivo en tu teléfono con:\n• ${res.stats.decksCount} mazos\n• ${res.stats.wordsCount} palabras\n• ${res.stats.srsCount} tarjetas de repaso.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar el archivo.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const docResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (docResult.canceled || !docResult.assets || docResult.assets.length === 0) {
        return;
      }

      const fileAsset = docResult.assets[0];
      setIsRestoring(true);

      const content = await FileSystem.readAsStringAsync(fileAsset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const pkg = parseBackupFile(content);

      const formattedDate = new Date(pkg.createdAt).toLocaleString();
      Alert.alert(
        'Restaurar Copia de Seguridad',
        `Se encontró una copia del ${formattedDate} con:\n• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas de repaso.\n\n¿Cómo deseás restaurar tus datos?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setIsRestoring(false) },
          {
            text: 'Combinar',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'merge');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se combinaron los datos correctamente: ${res.decksCount} mazos y ${res.wordsCount} palabras disponibles.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoring(false);
              }
            },
          },
          {
            text: 'Reemplazar Todo',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'replace');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se restauró la copia completa: ${res.decksCount} mazos y ${res.wordsCount} palabras.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoring(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      setIsRestoring(false);
      Alert.alert('Error al leer el archivo', e.message || 'No se pudo leer el archivo de copia de seguridad.');
    }
  };

  const formattedLastBackup = lastBackupTime
    ? new Date(lastBackupTime).toLocaleString()
    : 'No se ha realizado ninguna copia';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Tarjeta de Resumen / Perfil de Estudio */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeaderRow}>
          <View style={[styles.avatarBox, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="person" size={32} color={colors.primary} />
          </View>
          <View style={styles.profileTextInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>Estudiante Yomi</Text>
            <Text style={[styles.userSub, { color: colors.textMuted }]}>
              {stats.totalCards} {stats.totalCards === 1 ? 'tarjeta guardada' : 'tarjetas guardadas'}
            </Text>
          </View>
        </View>

        {/* Métricas rápidas */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.totalCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Tarjetas</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.dueCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pendientes Hoy</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.newCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nuevas</Text>
          </View>
        </View>
      </View>

      {/* Sección de Preferencias Visuales */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Apariencia e Interfaz</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextGroup}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Modo Oscuro</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              {isDark ? 'Tema Oscuro' : 'Tema Claro'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>
      </View>

      {/* Tarjeta 1: Copia de Seguridad en Google Drive */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: Spacing.xs }]}>
              Copia de Seguridad
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowDriveInfoModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 4 }}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.md }]}>
          Respaldá automáticamente tus mazos y progresos SRS en tu espacio privado de Google Drive para tenerlos en todos tus dispositivos.
        </Text>

        {/* Fila de Cuenta Conectada */}
        <View style={[styles.googleAccountCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
          {googleUser ? (
            <View style={styles.googleUserRow}>
              <View style={[styles.googleAvatarCircle, { backgroundColor: colors.primary + '25' }]}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View style={styles.googleUserInfo}>
                <View style={styles.googleNameBadgeRow}>
                  <Text style={[styles.googleUserName, { color: colors.text }]} numberOfLines={1}>
                    {googleUser.name}
                  </Text>
                </View>
                <Text style={[styles.googleUserEmail, { color: colors.textMuted }]} numberOfLines={1}>
                  {googleUser.email}
                </Text>
              </View>
              <TouchableOpacity onPress={handleDisconnectGoogle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.disconnectText, { color: colors.danger }]}>Salir</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.googleNotConnectedRow}>
              <View style={styles.googlePromptInfo}>
                <Text style={[styles.googlePromptTitle, { color: colors.text }]}>Cuenta no vinculada</Text>
                <Text style={[styles.googlePromptSub, { color: colors.textMuted }]}>
                  Conecta tu cuenta para respaldar en la nube
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.connectGoogleBtn,
                  { backgroundColor: '#4285F4' },
                  isConnectingGoogle && { opacity: 0.7 },
                ]}
                onPress={handleConnectGoogle}
                disabled={isConnectingGoogle}
                activeOpacity={0.8}
              >
                {isConnectingGoogle ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={15} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.connectGoogleBtnText}>Vincular</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Estado de la última copia en la nube */}
        <View style={[styles.backupStatusBox, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons
            name="cloud-done-outline"
            size={16}
            color={driveBackupMeta ? '#10B981' : colors.textMuted}
            style={{ marginRight: 8 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.backupStatusText, { color: colors.textMuted }]}>
              {driveBackupMeta
                ? `Última copia: ${new Date(driveBackupMeta.modifiedTime).toLocaleString()} ${formatBytes(driveBackupMeta.sizeBytes) ? `${formatBytes(driveBackupMeta.sizeBytes)}` : ''}`
                : 'Sin copias en Google Drive aún'}
            </Text>
            {driveBackupMeta && driveBackupMeta.decksCount !== undefined && (
              <Text style={[styles.backupStatusSubText, { color: colors.textMuted }]}>
                {driveBackupMeta.decksCount} mazos • {driveBackupMeta.wordsCount} palabras • {driveBackupMeta.srsCount} tarjetas SRS
              </Text>
            )}
          </View>
        </View>

        {/* Botones de acción Drive */}
        <View style={styles.backupActionsContainer}>
          <TouchableOpacity
            style={[
              styles.backupBtn,
              { backgroundColor: colors.primary },
              (!googleUser || isSyncingDrive || isRestoringDrive) && { opacity: 0.7 },
            ]}
            onPress={handleBackupToGoogleDrive}
            disabled={!googleUser || isSyncingDrive || isRestoringDrive}
            activeOpacity={0.8}
          >
            {isSyncingDrive ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.backupBtnText}>Hacer copia en Google Drive</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.restoreBtn,
              { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
              (!googleUser || isSyncingDrive || isRestoringDrive) && { opacity: 0.6 },
            ]}
            onPress={handleRestoreFromGoogleDrive}
            disabled={!googleUser || isSyncingDrive || isRestoringDrive}
            activeOpacity={0.8}
          >
            {isRestoringDrive ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="cloud-download" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.restoreBtnText, { color: colors.text }]}>Restaurar desde Google Drive</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tarjeta 2: Archivos Locales */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Respaldo Local</Text>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
          Exporta tu archivo para compartirlo con otros usuarios o restaura una copia manual desde tu almacenamiento.
        </Text>

        <View style={[styles.backupStatusBox, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.backupStatusText, { color: colors.textMuted }]}>
            Última exportación local: <Text style={{ color: colors.text, fontWeight: '600' }}>{formattedLastBackup}</Text>
          </Text>
        </View>

        <View style={styles.backupActionsContainer}>
          <TouchableOpacity
            style={[styles.localShareBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            onPress={handleCreateBackup}
            disabled={isBackingUp || isRestoring}
            activeOpacity={0.8}
          >
            {isBackingUp ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.localShareBtnText, { color: colors.text }]}>Exportar archivo</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restoreBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            onPress={handleRestoreBackup}
            disabled={isBackingUp || isRestoring}
            activeOpacity={0.8}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="folder-open-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                <Text style={[styles.restoreBtnText, { color: colors.text }]}>Restaurar archivo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Sección de Motor de Audio TTS */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prueba de audio</Text>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
          Toca un idioma para probar la voz. Si no se escucha, descárgala en los ajustes de tu dispositivo.
        </Text>

        <View style={styles.audioTestButtons}>
          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('ja-JP', 'こんにちは')}
          >
            <Text style={styles.audioFlag}>🇯🇵</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Japonés</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('zh-CN', '你好')}
          >
            <Text style={styles.audioFlag}>🇨🇳</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Chino</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('en-US', 'Hello')}
          >
            <Text style={styles.audioFlag}>🇺🇸</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Inglés</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Información del Sistema */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Sobre Yomi</Text>
        </View>
        <Text style={[styles.infoText, { color: colors.textMuted }]}>
          • Motor de Repaso: Algoritmo FSRS v5.{'\n'}
          • Diccionarios: CC-CEDICT y JMdict.{'\n'}
          • Clasificación Oficial: Niveles JLPT N5-N1 y HSK 1-6.{'\n'}
          • Versión: {Constants.expoConfig?.version || '0.1.5'}
        </Text>
      </View>

      {/* Modal Informativo de Copia de Seguridad en Google Drive */}
      <InfoModal
        visible={showDriveInfoModal}
        onClose={() => setShowDriveInfoModal(false)}
        icon="logo-google"
        iconColor="#4285F4"
        iconBgColor={isDark ? 'rgba(66, 133, 244, 0.18)' : 'rgba(66, 133, 244, 0.12)'}
        title="Copias en Google Drive"
        subtitle="ESPACIO PRIVADO Y SEGURO"
        description="Ahora podés respaldar tus mazos, tarjetas y progresos de estudio directamente en tu cuenta de Google Drive para tenerlos siempre a salvo."
        features={[
          {
            icon: 'shield-checkmark-outline',
            iconColor: '#10B981',
            title: '100% Privado y Seguro',
            description: 'Tus respaldos se guardan en tu carpeta privada de aplicaciones en Google Drive. Solo tu cuenta tiene acceso.',
          },
          {
            icon: 'sync-outline',
            iconColor: '#3B82F6',
            title: 'Multidispositivo sin pérdidas',
            description: 'Cambiá de teléfono o reinstalá la app y recuperá toda tu colección y estadísticas con un solo toque.',
          },
          {
            icon: 'refresh-circle-outline',
            iconColor: '#F59E0B',
            title: 'Sesión sin vencimiento',
            description: 'La sesión se renueva de forma automática en segundo plano para que nunca se interrumpan tus respaldos.',
          },
        ]}
        primaryButtonText={googleUser ? 'Entendido' : 'Vincular Google Drive'}
        onPrimaryPress={() => {
          setShowDriveInfoModal(false);
          if (!googleUser) {
            handleConnectGoogle();
          }
        }}
        secondaryButtonText={googleUser ? undefined : 'Más tarde'}
        onSecondaryPress={() => setShowDriveInfoModal(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  scrollContent: {
    paddingBottom: 94,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  profileTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  userSub: {
    fontSize: 14,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '31%',
    padding: Spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  settingTextGroup: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingSub: {
    fontSize: 13,
    marginTop: 2,
  },
  backupStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  backupStatusText: {
    fontSize: 12,
  },
  backupActionsContainer: {
    gap: 8,
    marginTop: Spacing.xs,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    ...Shadows.card,
  },
  backupBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  googleAccountCard: {
    padding: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  googleUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  googleUserInfo: {
    flex: 1,
  },
  googleNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  googleUserName: {
    fontSize: 14,
    fontWeight: '700',
  },
  googleUserEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  connectedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  disconnectText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  googleNotConnectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  googlePromptInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  googlePromptTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  googlePromptSub: {
    fontSize: 11,
    marginTop: 2,
  },
  connectGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  connectGoogleBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  backupStatusSubText: {
    fontSize: 11,
    marginTop: 2,
  },
  localShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  localShareBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  audioTestButtons: {
    marginTop: Spacing.xs,
  },
  audioTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 10,
    marginBottom: Spacing.xs,
  },
  audioFlag: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  audioBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 22,
  },
});

