import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../constants/theme';

export interface InfoModalFeature {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  description: string;
}

export interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  subtitle?: string;
  description?: string;
  features?: InfoModalFeature[];
  primaryButtonText?: string;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  children?: React.ReactNode;
}

/**
 * Modal informativo reutilizable para anunciar nuevas funciones,
 * guías o explicaciones visuales dentro de Yomi.
 */
export function InfoModal({
  visible,
  onClose,
  icon = 'information-circle',
  iconColor,
  iconBgColor,
  title,
  subtitle,
  description,
  features,
  primaryButtonText = 'Entendido',
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
  children,
}: InfoModalProps) {
  const { colors, isDark } = useTheme();

  const effectiveIconColor = iconColor || colors.primary;
  const effectiveIconBg = iconBgColor || (isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.1)');

  const handlePrimaryPress = () => {
    if (onPrimaryPress) {
      onPrimaryPress();
    } else {
      onClose();
    }
  };

  const handleSecondaryPress = () => {
    if (onSecondaryPress) {
      onSecondaryPress();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.dialogContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Botón superior de cierre */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {/* Ícono de Cabecera */}
            {icon && (
              <View style={[styles.iconWrapper, { backgroundColor: effectiveIconBg }]}>
                <Ionicons name={icon} size={36} color={effectiveIconColor} />
              </View>
            )}

            {/* Título Principal */}
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

            {/* Subtítulo Opcional */}
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.primary }]}>{subtitle}</Text>
            )}

            {/* Descripción */}
            {description && (
              <Text style={[styles.description, { color: colors.textMuted }]}>
                {description}
              </Text>
            )}

            {/* Lista de características o viñetas destacadas */}
            {features && features.length > 0 && (
              <View style={styles.featuresContainer}>
                {features.map((item, index) => (
                  <View
                    key={index}
                    style={[
                      styles.featureRow,
                      {
                        backgroundColor: colors.surfaceHighlight,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {item.icon && (
                      <View
                        style={[
                          styles.featureIconBox,
                          {
                            backgroundColor: (item.iconColor || colors.primary) + '18',
                          },
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={18}
                          color={item.iconColor || colors.primary}
                        />
                      </View>
                    )}
                    <View style={styles.featureTextCol}>
                      <Text style={[styles.featureTitle, { color: colors.text }]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.featureDesc, { color: colors.textMuted }]}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Contenido personalizado adicional */}
            {children}
          </ScrollView>

          {/* Botones de Acción */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={handlePrimaryPress}
            >
              <Text style={styles.primaryBtnText}>{primaryButtonText}</Text>
            </TouchableOpacity>

            {secondaryButtonText && (
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.85}
                onPress={handleSecondaryPress}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                  {secondaryButtonText}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    ...Shadows.card,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 6,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  iconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  featuresContainer: {
    width: '100%',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTextCol: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionsContainer: {
    width: '100%',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
