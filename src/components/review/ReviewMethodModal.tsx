import React, { memo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';

export interface ReviewMethodModalProps {
  visible: boolean;
  pendingSelection: {
    deckId: string;
    deckName: string;
    hasDue: boolean;
    languageCode?: string;
  } | null;
  colors: {
    primary: string;
    surface: string;
    surfaceHighlight: string;
    border: string;
    text: string;
    textMuted: string;
  };
  onClose: () => void;
  onSelectMethod: (method: 'text' | 'voice') => void;
  onSelectConjugation?: () => void;
  isPreparingVoice?: boolean;
}

export const ReviewMethodModal = memo(function ReviewMethodModal({
  visible,
  pendingSelection,
  colors,
  onClose,
  onSelectMethod,
  onSelectConjugation,
  isPreparingVoice = false,
}: ReviewMethodModalProps) {
  const isJapanese = pendingSelection?.languageCode === 'ja-JP';
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={isPreparingVoice ? undefined : onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                {pendingSelection?.deckName}
              </Text>
              <Text style={[styles.modalSub, { color: pendingSelection?.hasDue ? colors.primary : '#10B981' }]}>
                {pendingSelection?.hasDue
                  ? 'Repaso Oficial SRS (FSRS v5)'
                  : 'Mazo al día • Modo Práctica Libre'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} disabled={isPreparingVoice}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
            ¿CÓMO QUIERES ESTUDIAR HOY?
          </Text>

          {/* Opción 1: Modo Clásico (Teclado) */}
          <TouchableOpacity
            style={[styles.methodOptionCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            activeOpacity={0.8}
            disabled={isPreparingVoice}
            onPress={() => onSelectMethod('text')}
          >
            <View style={[styles.methodIconBox, { backgroundColor: colors.surface }]}>
              <Ionicons name="create-outline" size={24} color={colors.text} />
            </View>
            <View style={styles.methodTextCol}>
              <Text style={[styles.methodTitle, { color: colors.text }]}>Modo Clásico (Escritura)</Text>
              <Text style={[styles.methodDesc, { color: colors.textMuted }]}>
                Escribe la lectura o el significado con el teclado para fijar la memoria.
              </Text>
            </View>
            <View style={styles.trailingIconBox}>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Opción 2: Modo Manos Libres (Micrófono) */}
          <TouchableOpacity
            style={[
              styles.methodOptionCard,
              {
                backgroundColor: colors.primary + '12',
                borderColor: colors.primary,
                opacity: isPreparingVoice ? 0.7 : 1,
              },
            ]}
            activeOpacity={0.8}
            disabled={isPreparingVoice}
            onPress={() => onSelectMethod('voice')}
          >
            <View style={[styles.methodIconBox, { backgroundColor: colors.primary }]}>
              {isPreparingVoice ? (
                <Ionicons name="hourglass-outline" size={24} color="#FFF" />
              ) : (
                <Ionicons name="mic" size={24} color="#FFF" />
              )}
            </View>
            <View style={styles.methodTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.methodTitle, { color: colors.text }]}>Modo Manos Libres (Voz)</Text>
                <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.newBadgeText}>NUEVO</Text>
                </View>
              </View>
              <Text style={[styles.methodDesc, { color: colors.textMuted }]}>
                {isPreparingVoice
                  ? t('review.voicePreparingDesc')
                  : t('review.voiceMethodDesc')}
              </Text>
            </View>
            <View style={styles.trailingIconBox}>
              {isPreparingVoice ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>

          {/* Opción 3: Práctica de Conjugaciones (Solo mazos de japonés) */}
          {isJapanese && onSelectConjugation && (
            <>
              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalSectionLabel, { color: colors.textMuted, marginTop: 4 }]}>
                GRAMÁTICA Y FORMAS
              </Text>
              <TouchableOpacity
                style={[
                  styles.methodOptionCard,
                  {
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    borderColor: colors.primary,
                  },
                ]}
                activeOpacity={0.8}
                onPress={onSelectConjugation}
              >
                <View style={[styles.methodIconBox, { backgroundColor: colors.primary }]}>
                  <Ionicons name="sparkles" size={24} color="#FFF" />
                </View>
                <View style={styles.methodTextCol}>
                  <Text style={[styles.methodTitle, { color: colors.text }]}>Práctica de Conjugaciones</Text>
                  <Text style={[styles.methodDesc, { color: colors.textMuted }]}>
                    Ejercitá todas las formas de verbos y adjetivos
                  </Text>
                </View>
                <View style={styles.trailingIconBox}>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: Spacing.lg,
    paddingBottom: 40,
    ...Shadows.card,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  modalSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  methodOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    minHeight: 78,
  },
  methodIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  methodTextCol: {
    flex: 1,
    marginRight: Spacing.xs,
    justifyContent: 'center',
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  methodDesc: {
    fontSize: 12,
    lineHeight: 17,
    minHeight: 34,
  },
  trailingIconBox: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  newBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  sectionDivider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  grammarBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  grammarBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
