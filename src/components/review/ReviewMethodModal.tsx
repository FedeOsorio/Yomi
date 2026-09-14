import React, { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Shadows, Spacing } from '../../constants/theme';

export interface ReviewMethodModalProps {
  visible: boolean;
  pendingSelection: {
    deckId: string;
    deckName: string;
    hasDue: boolean;
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
}

export const ReviewMethodModal = memo(function ReviewMethodModal({
  visible,
  pendingSelection,
  colors,
  onClose,
  onSelectMethod,
}: ReviewMethodModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
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
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
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
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Opción 2: Modo Manos Libres (Micrófono) */}
          <TouchableOpacity
            style={[
              styles.methodOptionCard,
              {
                backgroundColor: colors.primary + '12',
                borderColor: colors.primary,
              },
            ]}
            activeOpacity={0.8}
            onPress={() => onSelectMethod('voice')}
          >
            <View style={[styles.methodIconBox, { backgroundColor: colors.primary }]}>
              <Ionicons name="mic" size={24} color="#FFF" />
            </View>
            <View style={styles.methodTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.methodTitle, { color: colors.text }]}>Modo Manos Libres (Voz)</Text>
                <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.newBadgeText}>NUEVO</Text>
                </View>
              </View>
              <Text style={[styles.methodDesc, { color: colors.textMuted }]}>
                Pronuncia en voz alta. Flujo de tarjetas 100% automático.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
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
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  methodDesc: {
    fontSize: 12,
    lineHeight: 17,
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
});
