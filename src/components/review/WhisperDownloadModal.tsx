import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Shadows, Spacing, Typography } from '../../constants/theme';

export interface WhisperDownloadModalProps {
  visible: boolean;
  progressPercent: number;
  bytesWritten: number;
  totalBytes: number;
  status: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  errorMessage?: string;
  colors: {
    primary: string;
    surface: string;
    surfaceHighlight: string;
    border: string;
    text: string;
    textMuted: string;
    danger?: string;
  };
  onCancel: () => void;
  onRetry: () => void;
}

export const WhisperDownloadModal = memo(function WhisperDownloadModal({
  visible,
  progressPercent,
  bytesWritten,
  totalBytes,
  status,
  errorMessage,
  colors,
  onCancel,
  onRetry,
}: WhisperDownloadModalProps) {
  const mbWritten = (bytesWritten / (1024 * 1024)).toFixed(1);
  const mbTotal = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '31.5';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={status === 'downloading' ? undefined : onCancel}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Icon Header */}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: status === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              },
            ]}
          >
            {status === 'error' ? (
              <Ionicons name="alert-circle" size={36} color={colors.danger || '#EF4444'} />
            ) : status === 'ready' ? (
              <Ionicons name="checkmark-circle" size={36} color="#10B981" />
            ) : (
              <Ionicons name="mic-circle" size={36} color={colors.primary} />
            )}
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {status === 'ready'
              ? '¡Motor de Voz Listo!'
              : status === 'error'
              ? 'Error de Descarga'
              : 'Preparando Reconocimiento'}
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {status === 'error'
              ? errorMessage || 'No se pudo descargar el modelo. Revisa tu conexión a internet.'
              : status === 'ready'
              ? 'El modelo Whisper ha sido configurado. Iniciando sesión de repaso...'
              : 'Descargando modelo de Inteligencia Artificial offline (~31 MB). Solo se hace una vez para garantizar máxima precisión en japonés.'}
          </Text>

          {/* Progress Section */}
          {status !== 'error' && status !== 'ready' && (
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${Math.max(progressPercent, 4)}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.statsRow}>
                <Text style={[styles.statsText, { color: colors.textMuted }]}>
                  {status === 'verifying'
                    ? 'Verificando archivo...'
                    : `${mbWritten} MB / ${mbTotal} MB`}
                </Text>
                <Text style={[styles.percentText, { color: colors.primary }]}>
                  {progressPercent}%
                </Text>
              </View>
            </View>
          )}

          {/* Spinner during active download/verification */}
          {(status === 'downloading' || status === 'verifying') && (
            <View style={styles.spinnerRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.spinnerText, { color: colors.textMuted }]}>
                {status === 'verifying' ? 'Iniciando Whisper...' : 'Descargando desde HuggingFace...'}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {status === 'error' ? (
              <>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                  onPress={onRetry}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
              </>
            ) : status === 'ready' ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border, width: '100%' }]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.xl,
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  progressContainer: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  percentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: 8,
  },
  spinnerText: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
