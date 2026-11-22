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
import { renameDeck } from '../../lib/deck-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../i18n';

interface RenameDeckDialogProps {
  /** Mazo a renombrar (null = cerrado) */
  deck: { id: string; name: string } | null;
  onClose: () => void;
  /** Se llama con el nombre nuevo, ya guardado */
  onRenamed: (name: string) => void;
}

/** Diálogo para cambiar el nombre de un mazo (mismo diseño que el de carpetas). */
export function RenameDeckDialog({ deck, onClose, onRenamed }: RenameDeckDialogProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (deck) setName(deck.name);
  }, [deck]);

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const save = async () => {
    if (!deck) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('common.attention'), t('decks.alertNameRequired'));
      return;
    }
    if (trimmed === deck.name) {
      close();
      return;
    }
    setIsSaving(true);
    try {
      await renameDeck(deck.id, trimmed);
      onRenamed(trimmed);
      close();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('decks.renameDeckError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={deck !== null} transparent animationType="none" onRequestClose={close}>
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
              <View style={[styles.iconBox, { backgroundColor: `${colors.primary}22` }]}>
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>{t('decks.renameDeck')}</Text>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border, color: colors.text }]}
              placeholder={t('decks.deckNameLabel')}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              selectTextOnFocus
              selectionColor={colors.primary}
              returnKeyType="done"
              onSubmitEditing={save}
            />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
                onPress={close}
                disabled={isSaving}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={save} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.btnText, { color: '#FFF' }]}>{t('common.save')}</Text>
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
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: { width: '100%', paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '700' },
});
