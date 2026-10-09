import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SHERPA_MODEL_SIZE_MB } from '../../../lib/sherpa-service';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';

export interface VoiceModelRequiredModalProps {
  visible: boolean;
  colors: {
    primary: string;
    surface: string;
    surfaceHighlight: string;
    border: string;
    text: string;
    textMuted: string;
  };
  onClose: () => void;
  /** Lleva al usuario a Configuración › Prueba de audio. */
  onGoToDownload: () => void;
}

/** Aviso de que falta el modelo de reconocimiento de voz offline. */
export const VoiceModelRequiredModal = memo(function VoiceModelRequiredModal({
  visible,
  colors,
  onClose,
  onGoToDownload,
}: VoiceModelRequiredModalProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '1A' }]}>
            <Ionicons name="mic" size={30} color={colors.primary} />
            <View style={[styles.iconBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Ionicons name="arrow-down" size={12} color="#FFF" />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{t('review.voiceModelModalTitle')}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {t('review.voiceModelModalDesc')}
          </Text>

          <View style={[styles.infoRow, { backgroundColor: colors.surfaceHighlight }]}>
            <View style={styles.infoItem}>
              <Ionicons name="cloud-download-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.infoText, { color: colors.text }]}>{SHERPA_MODEL_SIZE_MB} MB</Text>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.infoItem}>
              <Ionicons name="wifi-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.infoText, { color: colors.text }]}>{t('review.voiceModelModalWifi')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={onGoToDownload}
          >
            <Text style={styles.primaryBtnText}>{t('review.voiceModelModalGo')}</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} hitSlop={8}>
            <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>{t('review.voiceModelModalLater')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: Spacing.lg,
    paddingBottom: 40,
    alignItems: 'center',
    ...Shadows.card,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: Spacing.lg,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoDivider: {
    width: 1,
    height: 18,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryBtn: {
    marginTop: Spacing.md,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
