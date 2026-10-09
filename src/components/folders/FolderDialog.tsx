import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';

export const FOLDER_PALETTE = [
  '#3B82F6', // Azul
  '#10B981', // Esmeralda
  '#8B5CF6', // Púrpura
  '#F59E0B', // Ámbar
  '#EF4444', // Rojo
  '#06B6D4', // Cian
  '#EC4899', // Rosa
  '#64748B', // Pizarra
];

interface FolderDialogProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialColor?: string | null;
  /** Carpeta donde se va a crear (se muestra como "Dentro de …"). */
  parentName?: string | null;
  onSubmit: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}

/** Diálogo para crear o editar una carpeta (nombre y color). */
export function FolderDialog({ visible, mode, initialName, initialColor, parentName, onSubmit, onClose }: FolderDialogProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_PALETTE[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName ?? '');
      setColor(initialColor || FOLDER_PALETTE[0]);
    }
  }, [visible, initialName, initialColor]);

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('common.attention'), t('folders.folderNameRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed, color);
      close();
    } catch (e: any) {
      Alert.alert(t('common.error'), `${t('folders.folderSaveError')} ${e?.message || ''}`.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={FadeOut.duration(120)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.header}>
              <View style={[styles.iconBox, { backgroundColor: `${color}22` }]}>
                <Ionicons name="folder" size={20} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {mode === 'create' ? t('folders.createFolder') : t('folders.editFolder')}
                </Text>
                {mode === 'create' && parentName ? (
                  <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                    {t('folders.insideFolder', { name: parentName })}
                  </Text>
                ) : null}
              </View>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border, color: colors.text }]}
              placeholder={t('folders.folderPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              selectionColor={color}
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            <Text style={[styles.paletteLabel, { color: colors.textMuted }]}>{t('folders.color')}</Text>
            <View style={styles.paletteRow}>
              {FOLDER_PALETTE.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      active && { borderColor: colors.surface, borderWidth: 2, transform: [{ scale: 1.15 }] },
                    ]}
                    onPress={() => setColor(c)}
                    activeOpacity={0.8}
                  >
                    {active && <Ionicons name="checkmark" size={13} color="#FFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
                onPress={close}
                disabled={isSubmitting}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={submit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.btnText, { color: '#FFF' }]}>
                    {mode === 'create' ? t('decks.createBtn') : t('common.save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1.5,
    ...Shadows.card,
    elevation: 12,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 1,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 16,
  },
  paletteLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 20,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
