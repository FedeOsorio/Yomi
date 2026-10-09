import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notifyDataChanged, onDataChanged } from '../../lib/backup-service';
import { DeckWithStats, Folder, getDecksWithStats, getFolders, reorderFolders } from '../../lib/deck-service';
import { countDecksRecursive, flattenFolderTree, getChildFolders } from '../../lib/folder-tree';
import { useTheme } from '../../providers/ThemeProvider';
import { useFolderManager } from '../hooks/useFolderManager';
import { Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../i18n';

const INDENT = 18;

export default function FoldersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const folderManager = useFolderManager(folders);

  const loadData = useCallback(async () => {
    try {
      const [fList, dList] = await Promise.all([getFolders(), getDecksWithStats()]);
      setFolders(fList);
      setDecks(dList);
    } catch (e) {
      console.error('Error al cargar carpetas en pantalla:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return onDataChanged(loadData);
  }, [loadData]);

  const tree = useMemo(() => flattenFolderTree(folders), [folders]);
  const deckCounts = useMemo(() => countDecksRecursive(folders, decks), [folders, decks]);

  /** Sube o baja una carpeta entre sus hermanas. */
  const handleMoveFolder = async (folder: Folder, direction: 'up' | 'down') => {
    const siblings = getChildFolders(folders, folder.parentId);
    const index = siblings.findIndex((f) => f.id === folder.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await reorderFolders(reordered.map((f) => f.id));
      notifyDataChanged();
    } catch (e) {
      console.error('Error al reordenar carpetas:', e);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Superior Nativo de Pantalla */}
      <View
        style={[
          styles.headerRow,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top + 6,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandTitleContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('folders.manageFolders')}</Text>
        </View>

        <TouchableOpacity
          onPress={() => folderManager.openCreate(null)}
          style={styles.headerAddBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('folders.createFolder')}
        >
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Contenido Principal con Scroll Completo de Pantalla */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
        >
          {/* Subtítulo explicativo */}
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            {t('folders.organizeSubtitle')}
          </Text>

          {/* Botón "+ Crear nueva carpeta" */}
          <TouchableOpacity
            style={[
              styles.createActionCard,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.75}
            onPress={() => folderManager.openCreate(null)}
          >
            <View style={[styles.createIconBox, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.createActionText, { color: colors.primary }]}>
              {t('folders.newFolder')}
            </Text>
          </TouchableOpacity>

          {/* Lista de Carpetas con altura natural y sin límites de modal */}
          {folders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t('folders.noFoldersTitle')}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {t('folders.noFoldersSub')}
              </Text>
            </View>
          ) : (
            tree.map(({ folder, depth }) => {
              const folderColor = folder.color || colors.primary;
              const count = deckCounts[folder.id] || 0;
              const siblings = getChildFolders(folders, folder.parentId);
              const isFirst = siblings[0]?.id === folder.id;
              const isLast = siblings[siblings.length - 1]?.id === folder.id;

              return (
                <Animated.View
                  key={folder.id}
                  layout={LinearTransition.duration(200)}
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(120)}
                  style={{ marginLeft: depth * INDENT }}
                >
                  <View style={[styles.folderRowItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.folderInfoCol}>
                      <View
                        style={[
                          styles.folderColorDot,
                          { backgroundColor: `${folderColor}25`, borderColor: `${folderColor}55` },
                        ]}
                      >
                        <Ionicons name="folder" size={18} color={folderColor} />
                      </View>
                      <View style={styles.folderTextContainer}>
                        <Text style={[styles.folderName, { color: colors.text }]} numberOfLines={1}>
                          {folder.name}
                        </Text>
                        <Text style={[styles.folderCount, { color: colors.textMuted }]}>
                          {t('folders.deckCount', { count })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, isFirst && styles.actionBtnDisabled]}
                        disabled={isFirst}
                        onPress={() => handleMoveFolder(folder, 'up')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel="Up"
                      >
                        <Ionicons name="chevron-up" size={20} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, isLast && styles.actionBtnDisabled]}
                        disabled={isLast}
                        onPress={() => handleMoveFolder(folder, 'down')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel="Down"
                      >
                        <Ionicons name="chevron-down" size={20} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => folderManager.openActions(folder)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel={t('folders.editFolder')}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}

      {folderManager.modals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  brandTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSep: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerAddBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  createActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: Spacing.md,
    gap: 12,
  },
  createIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createActionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  folderRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    ...Shadows.card,
    elevation: 1,
  },
  folderInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  folderColorDot: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  folderTextContainer: {
    flex: 1,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  folderCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    padding: 7,
    borderRadius: 8,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

});
