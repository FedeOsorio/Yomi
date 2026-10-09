import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  createFullBackupPackage,
  exportToPhoneFolder,
  getLastBackupDate,
  onDataChanged,
  parseBackupFile,
  restoreBackupPackage
} from '../../../lib/backup-service';
import { GoogleUserProfile } from '../../../lib/google-drive-service';
import { useGoogleDriveStore } from '../../stores/googleDriveStore';
import { getStudyStats } from '../../../lib/srs-engine';
import { InfoModal } from '../../components/InfoModal';
import { AudioSettingsSection } from '../../components/settings/AudioSettingsSection';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation, useLanguageStore } from '../../i18n';
function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProfileScreen() {
  const { isDark, toggleTheme, colors } = useTheme();
  const { t } = useTranslation();
  const { currentLanguage, preference, setLanguagePreference } = useLanguageStore();
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
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  // Estado reactivo centralizado con Zustand
  const {
    googleUser,
    driveBackupMeta,
    autoBackupEnabled,
    lastAutoBackupTime,
    setAutoBackupEnabled,
    isConnecting: isConnectingGoogle,
    isSyncing: isSyncingDrive,
    isRestoring: isRestoringDrive,
    isChecking,
    connect: connectGoogle,
    disconnect: disconnectGoogle,
    createBackup: backupToDrive,
    inspectBackup,
    restoreBackup: restoreDriveBackup,
    refreshMeta: refreshDriveMeta,
    init: initGoogleDrive,
  } = useGoogleDriveStore();

  const getNextBackupText = () => {
    if (!autoBackupEnabled) return t('profile.backupDisabled');
    const lastIso = lastAutoBackupTime || driveBackupMeta?.modifiedTime;
    if (!lastIso) return t('profile.backupOnUse');
    const lastDate = new Date(lastIso);
    if (isNaN(lastDate.getTime())) return t('profile.backupOnUse');
    const nextDate = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    if (nextDate <= now) {
      return t('profile.backupPendingSync');
    }
    const timeStr = nextDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const isTomorrow =
      nextDate.getDate() === new Date(now.getTime() + 86400000).getDate() &&
      nextDate.getMonth() === new Date(now.getTime() + 86400000).getMonth();
    const isToday =
      nextDate.getDate() === now.getDate() &&
      nextDate.getMonth() === now.getMonth();

    if (isToday) {
      return t('profile.backupToday', { time: timeStr });
    } else if (isTomorrow) {
      return t('profile.backupTomorrow', { time: timeStr });
    } else {
      const dateStr = nextDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      return `${t('profile.nextBackup')}: ${dateStr}, ${timeStr}`;
    }
  };
  const [showDriveInfoModal, setShowDriveInfoModal] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await getStudyStats();
      setStats(res);
      const backupTime = await getLastBackupDate();
      setLastBackupTime(backupTime);
    } catch (e) { }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  useEffect(() => {
    initGoogleDrive();
  }, []);

  useEffect(() => {
    return onDataChanged(() => {
      fetchStats();
    });
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
              useGoogleDriveStore.getState().setGoogleUser(demoUser);
              Alert.alert('Modo de Prueba Activo', 'Se vinculó la cuenta de prueba usuario.demo@gmail.com.');
            },
          },
        ]
      );
      return;
    }

    const res = await connectGoogle();
    if (res.success && res.user) {
      if (res.missingDriveScope) {
        Alert.alert(
          'Permiso de Google Drive pendiente',
          `Se vinculó la cuenta ${res.user.email}, pero no se otorgó permiso a Google Drive.\n\nAl iniciar sesión en Google, asegurate de marcar la casilla de verificación de Google Drive para permitir respaldar en la nube.`
        );
      } else if (res.backupMeta && res.backupMeta.modifiedTime) {
        const formattedDate = new Date(res.backupMeta.modifiedTime).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        Alert.alert(
          'Copia de seguridad encontrada',
          `Vinculado con ${res.user.email}.\n\nSe encontró una copia de seguridad en Google Drive del ${formattedDate}.\n\n¿Deseás restaurarla ahora en este dispositivo?`,
          [
            {
              text: 'Ahora no',
              style: 'cancel',
            },
            {
              text: 'Restaurar',
              onPress: () => {
                handleRestoreFromGoogleDrive();
              },
            },
          ]
        );
      } else {
        Alert.alert('Google Drive Conectado', `Vinculado exitosamente con ${res.user.email}.`);
      }
    } else if (res.error && res.error !== 'USER_CANCELLED') {
      Alert.alert('Error al vincular', res.error);
    }
  };

  const handleDisconnectGoogle = () => {
    Alert.alert(
      t('profile.disconnectTitle'),
      t('profile.disconnectMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: async () => {
            await disconnectGoogle();
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

    const res = await backupToDrive();
    if (res.success && res.stats) {
      const foldersText = res.stats.foldersCount
        ? `${res.stats.foldersCount} ${res.stats.foldersCount === 1 ? 'carpeta' : 'carpetas'}, `
        : '';
      Alert.alert(
        'Copia en Google Drive Exitosa',
        `Se respaldaron ${foldersText}${res.stats.decksCount} mazos, ${res.stats.wordsCount} palabras y ${res.stats.srsCount} tarjetas SRS en tu espacio privado de Google Drive.`
      );
    } else if (res.error) {
      Alert.alert('Error al respaldar en Drive', res.error);
    }
  };

  const handleRestoreFromGoogleDrive = async () => {
    const user = googleUser || useGoogleDriveStore.getState().googleUser;
    if (!user) {
      Alert.alert('Cuenta no conectada', 'Por favor conecta tu cuenta de Google primero.');
      return;
    }

    const inspection = await inspectBackup();
    if (!inspection.success || !inspection.pkg) {
      Alert.alert('Sin copias en Google Drive', inspection.error || 'No se encontró ninguna copia previa en tu cuenta.');
      return;
    }

    const pkg = inspection.pkg;
    const formattedDate = new Date(pkg.createdAt).toLocaleString();
    const foldersBullet = pkg.metadata.foldersCount
      ? `• ${pkg.metadata.foldersCount} ${pkg.metadata.foldersCount === 1 ? 'carpeta' : 'carpetas'}\n`
      : '';

    Alert.alert(
      'Restaurar desde Google Drive',
      `Se encontró tu copia del ${formattedDate} con:\n${foldersBullet}• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas SRS.\n\n¿Cómo deseás restaurar tus datos en este dispositivo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Combinar',
          onPress: async () => {
            const res = await restoreDriveBackup('merge', pkg);
            if (res.success && res.res) {
              await fetchStats();
              const foldersText = res.res.foldersCount ? `${res.res.foldersCount} carpetas, ` : '';
              Alert.alert(
                'Restauración Exitosa',
                `Se combinaron los datos desde Google Drive: ${foldersText}${res.res.decksCount} mazos y ${res.res.wordsCount} palabras disponibles.`
              );
            } else if (res.error) {
              Alert.alert('Error al restaurar', res.error);
            }
          },
        },
        {
          text: 'Reemplazar Todo',
          style: 'destructive',
          onPress: async () => {
            const res = await restoreDriveBackup('replace', pkg);
            if (res.success && res.res) {
              await fetchStats();
              const foldersText = res.res.foldersCount ? `${res.res.foldersCount} carpetas, ` : '';
              Alert.alert(
                'Restauración Exitosa',
                `Se restauró la copia completa desde Google Drive: ${foldersText}${res.res.decksCount} mazos y ${res.res.wordsCount} palabras.`
              );
            } else if (res.error) {
              Alert.alert('Error al restaurar', res.error);
            }
          },
        },
      ]
    );
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await exportToPhoneFolder();
      if (res.cancelled) return;
      const nowIso = new Date().toISOString();
      setLastBackupTime(nowIso);
      const foldersBullet = res.stats.foldersCount
        ? `• ${res.stats.foldersCount} ${res.stats.foldersCount === 1 ? 'carpeta' : 'carpetas'}\n`
        : '';
      Alert.alert(
        'Copia guardada con éxito',
        `Se guardó el archivo en tu teléfono con:\n${foldersBullet}• ${res.stats.decksCount} mazos\n• ${res.stats.wordsCount} palabras\n• ${res.stats.srsCount} tarjetas de repaso.`
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
      const foldersBullet = pkg.metadata.foldersCount
        ? `• ${pkg.metadata.foldersCount} ${pkg.metadata.foldersCount === 1 ? 'carpeta' : 'carpetas'}\n`
        : '';
      Alert.alert(
        'Restaurar Copia de Seguridad',
        `Se encontró una copia del ${formattedDate} con:\n${foldersBullet}• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas de repaso.\n\n¿Cómo deseás restaurar tus datos?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setIsRestoring(false) },
          {
            text: 'Combinar',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'merge');
                await fetchStats();
                const foldersText = res.foldersCount ? `${res.foldersCount} carpetas, ` : '';
                Alert.alert(
                  'Restauración Exitosa',
                  `Se combinaron los datos correctamente: ${foldersText}${res.decksCount} mazos y ${res.wordsCount} palabras disponibles.`
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
                const foldersText = res.foldersCount ? `${res.foldersCount} carpetas, ` : '';
                Alert.alert(
                  'Restauración Exitosa',
                  `Se restauró la copia completa: ${foldersText}${res.decksCount} mazos y ${res.wordsCount} palabras.`
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

  // Llegada desde el aviso "falta el modelo de voz": scroll hasta la sección de audio y resaltarla
  const { section } = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [audioSectionY, setAudioSectionY] = useState<number | null>(null);
  const [highlightAudio, setHighlightAudio] = useState(false);

  useEffect(() => {
    if (section !== 'audio' || audioSectionY === null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, audioSectionY - Spacing.md), animated: true });
    setHighlightAudio(true);
    router.setParams({ section: undefined });
    const timer = setTimeout(() => setHighlightAudio(false), 2000);
    return () => clearTimeout(timer);
  }, [section, audioSectionY]);

  const formattedLastBackup = lastBackupTime
    ? new Date(lastBackupTime).toLocaleString()
    : t('profile.noLocalBackup');

  return (
    <ScrollView
      ref={scrollRef}
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
            <Text style={[styles.userName, { color: colors.text }]}>{t('profile.studentName')}</Text>
            <Text style={[styles.userSub, { color: colors.textMuted }]}>
              {t('profile.cardsSaved', { count: stats.totalCards })}
            </Text>
          </View>
        </View>

        {/* Métricas rápidas */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.totalCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('profile.totalCards')}</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.dueCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('profile.dueToday')}</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.newCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('profile.newCards')}</Text>
          </View>
        </View>
      </View>

      {/* Sección de Preferencias Visuales e Idioma */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            zIndex: isLangDropdownOpen ? 100 : 1,
            elevation: isLangDropdownOpen ? 10 : undefined,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.theme')}</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextGroup}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('profile.darkMode')}</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        {/* Selector de Idioma de la Aplicación (Dropdown Flotante) */}
        <View
          style={[
            styles.settingRow,
            {
              flexDirection: 'column',
              alignItems: 'stretch',
              marginTop: Spacing.md,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: Spacing.md,
              zIndex: 1000,
            },
          ]}
        >
          <Text style={[styles.settingLabel, { color: colors.text, marginBottom: Spacing.xs }]}>
            {t('profile.appLanguage')}
          </Text>

          {/* Trigger Dropdown Button */}
          {(() => {
            const languageOptions = [
              { code: 'system', label: t('profile.systemLanguage'), flag: '🌐' },
              { code: 'es', label: 'Español', flag: '🇪🇸' },
              { code: 'en', label: 'English', flag: '🇺🇸' },
              { code: 'pt', label: 'Português', flag: '🇧🇷' },
              { code: 'ja', label: '日本語', flag: '🇯🇵' },
            ];
            const currentOption = languageOptions.find((l) => l.code === preference) || languageOptions[0];

            return (
              <View style={{ width: '100%', position: 'relative', zIndex: 1000 }}>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: isLangDropdownOpen ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownTriggerContent}>
                    <Text style={styles.dropdownFlag}>{currentOption.flag}</Text>
                    <Text style={[styles.dropdownSelectedText, { color: colors.text }]}>
                      {currentOption.label}
                    </Text>
                  </View>
                  <Ionicons
                    name={isLangDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>

                {/* Dropdown Options List */}
                {isLangDropdownOpen && (
                  <View
                    style={[
                      styles.dropdownMenu,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    {languageOptions.map((lang, index) => {
                      const isSelected = preference === lang.code;
                      return (
                        <TouchableOpacity
                          key={lang.code}
                          style={[
                            styles.dropdownMenuItem,
                            isSelected && { backgroundColor: colors.primary + '15' },
                            index < languageOptions.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border + '60',
                            },
                          ]}
                          onPress={() => {
                            setLanguagePreference(lang.code as any);
                            setIsLangDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.dropdownMenuItemLeft}>
                            <Text style={styles.dropdownFlag}>{lang.flag}</Text>
                            <Text
                              style={[
                                styles.dropdownItemText,
                                { color: colors.text },
                                isSelected && { color: colors.primary, fontWeight: '700' },
                              ]}
                            >
                              {lang.label}
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })()}
        </View>
      </View>

      {/* Tarjeta 1: Copia de Seguridad en Google Drive */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: Spacing.xs }]}>
              {t('profile.backup')}
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
          {t('profile.backupDescription')}
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
                <Text style={[styles.disconnectText, { color: colors.danger }]}>{t('profile.logout')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.googleNotConnectedRow}>
              <View style={styles.googlePromptInfo}>
                <Text style={[styles.googlePromptTitle, { color: colors.text }]}>{t('profile.accountNotLinked')}</Text>
                <Text style={[styles.googlePromptSub, { color: colors.textMuted }]}>
                  {t('profile.connectToBackup')}
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
                    <Text style={styles.connectGoogleBtnText}>{t('profile.link')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Respaldo automático diario */}
        {googleUser && (
          <View style={[styles.settingRow, { marginTop: Spacing.xs, marginBottom: Spacing.sm, paddingHorizontal: 0 }]}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text, fontSize: 14 }]}>
                {t('profile.autoBackup')}
              </Text>
              <Text style={[styles.settingSub, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>
                {getNextBackupText()}
              </Text>
            </View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={setAutoBackupEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFF"
            />
          </View>
        )}

        {/* Estado de la última copia en la nube */}
        <TouchableOpacity
          style={[styles.backupStatusBox, { backgroundColor: colors.surfaceHighlight }]}
          onPress={async () => {
            if (!googleUser) return;
            const res = await refreshDriveMeta(true);
            if (res.success && res.meta) {
              Alert.alert(t('profile.backupFoundTitle'), t('profile.lastBackup', { date: new Date(res.meta.modifiedTime).toLocaleString() }));
            } else if (res.success) {
              Alert.alert('Google Drive', t('profile.backupNotFound'));
            } else if (res.error) {
              Alert.alert(t('common.error'), res.error);
            }
          }}
          disabled={isChecking}
          activeOpacity={0.7}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
          ) : (
            <Ionicons
              name="cloud-done-outline"
              size={16}
              color={driveBackupMeta ? '#10B981' : colors.textMuted}
              style={{ marginRight: 8 }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.backupStatusText, { color: colors.textMuted }]}>
              {isChecking
                ? t('profile.checkingDrive')
                : driveBackupMeta
                ? `${t('profile.lastBackup', { date: new Date(driveBackupMeta.modifiedTime).toLocaleString() })} ${formatBytes(driveBackupMeta.sizeBytes) ? `${formatBytes(driveBackupMeta.sizeBytes)}` : ''}`
                : t('profile.noDriveBackups')}
            </Text>
            {driveBackupMeta && driveBackupMeta.decksCount !== undefined && !isChecking && (
              <Text style={[styles.backupStatusSubText, { color: colors.textMuted }]}>
                {t('profile.backupSummary', {
                  decks: driveBackupMeta.decksCount,
                  words: driveBackupMeta.wordsCount,
                  srs: driveBackupMeta.srsCount,
                })}
              </Text>
            )}
          </View>
        </TouchableOpacity>

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
                <Text style={styles.backupBtnText}>{t('profile.makeBackupDrive')}</Text>
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
                <Text style={[styles.restoreBtnText, { color: colors.text }]}>{t('profile.restoreFromDrive')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tarjeta 2: Archivos Locales */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.localBackup')}</Text>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
          {t('profile.localBackupDesc')}
        </Text>

        <View style={[styles.backupStatusBox, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.backupStatusText, { color: colors.textMuted }]}>
            {t('profile.lastLocalExport')}{' '}
            <Text style={{ color: colors.text, fontWeight: '600' }}>{formattedLastBackup}</Text>
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
                <Text style={[styles.localShareBtnText, { color: colors.text }]}>{t('profile.exportFile')}</Text>
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
                <Text style={[styles.restoreBtnText, { color: colors.text }]}>{t('profile.restoreFile')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Audio: voces de lectura y modelo de reconocimiento de voz */}
      <View onLayout={(e) => setAudioSectionY(e.nativeEvent.layout.y)}>
        <AudioSettingsSection colors={colors} highlighted={highlightAudio} />
      </View>

      {/* Información del Sistema */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.aboutYomi')}</Text>
        </View>
        <Text style={[styles.infoText, { color: colors.textMuted }]}>
          {t('profile.aboutYomiText', { version: Constants.expoConfig?.version || '0.1.5' })}
        </Text>
      </View>

      {/* Modal Informativo de Copia de Seguridad en Google Drive */}
      <InfoModal
        visible={showDriveInfoModal}
        onClose={() => setShowDriveInfoModal(false)}
        icon="logo-google"
        iconColor="#4285F4"
        iconBgColor={isDark ? 'rgba(66, 133, 244, 0.18)' : 'rgba(66, 133, 244, 0.12)'}
        title={t('profile.infoModalTitle')}
        subtitle={t('profile.infoModalSubtitle')}
        description={t('profile.infoModalDesc')}
        features={[
          {
            icon: 'shield-checkmark-outline',
            iconColor: '#10B981',
            title: t('profile.infoModalFeature1Title'),
            description: t('profile.infoModalFeature1Desc'),
          },
          {
            icon: 'sync-outline',
            iconColor: '#3B82F6',
            title: t('profile.infoModalFeature2Title'),
            description: t('profile.infoModalFeature2Desc'),
          },
        ]}
        primaryButtonText={googleUser ? t('profile.understood') : t('profile.link')}
        onPrimaryPress={() => {
          setShowDriveInfoModal(false);
          if (!googleUser) {
            handleConnectGoogle();
          }
        }}
        secondaryButtonText={googleUser ? undefined : t('review.later')}
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
  infoText: {
    fontSize: 13,
    lineHeight: 22,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  dropdownTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownFlag: {
    fontSize: 18,
    marginRight: 10,
  },
  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 9999,
    ...Shadows.card,
    elevation: 10,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  dropdownMenuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

