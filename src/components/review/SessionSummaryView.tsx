import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography } from '../../constants/theme';

export interface SessionSummaryViewProps {
  sessionCompleted: boolean;
  sessionCount: number;
  selectedDeckName: string;
  colors: {
    background: string;
    surfaceHighlight: string;
    border: string;
    primary: string;
    text: string;
    textMuted: string;
  };
  onExitSession: () => void;
  onPracticeAll: () => void;
}

export const SessionSummaryView = memo(function SessionSummaryView({
  sessionCompleted,
  sessionCount,
  selectedDeckName,
  colors,
  onExitSession,
  onPracticeAll,
}: SessionSummaryViewProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Spacing.sm }]}>
      <View style={styles.completedBox}>
        <View style={[styles.completedIconBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
          <Ionicons name="trophy" size={54} color={colors.primary} />
        </View>
        <Text style={[styles.completedTitle, { color: colors.text }]}>
          {sessionCompleted ? '¡Sesión completada!' : '¡Mazo al día!'}
        </Text>
        <Text style={[styles.completedSub, { color: colors.textMuted }]}>
          {sessionCompleted
            ? `Completaste la verificación de ${sessionCount} tarjeta(s) en "${selectedDeckName}".`
            : `No tienes tarjetas pendientes de repaso en "${selectedDeckName}".`}
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={onExitSession}
          activeOpacity={0.8}
        >
          <Ionicons name="albums-outline" size={20} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={styles.primaryBtnText}>Volver a mis mazos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
          onPress={onPracticeAll}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Practicar todo el mazo libremente</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  completedBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: 70,
  },
  completedIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  completedTitle: {
    ...Typography.h1,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  completedSub: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    marginBottom: Spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
});
