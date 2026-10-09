import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ALL_LANGUAGES, DeckWithStats, SUPPORTED_LANGUAGES } from '../../../lib/deck-service';
import { Shadows, Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';

interface DeckPickerProps {
  decks: DeckWithStats[];
  colors: { primary: string; surface: string; border: string; text: string; textMuted: string };
  onSelectDeck: (deckId: string, deckName: string, hasDue: boolean) => void;
  onGoToDecks: () => void;
}

/** Pantalla inicial de Repaso: encabezado con las tarjetas pendientes y la cuadrícula de mazos. */
export function DeckPicker({ decks, colors, onSelectDeck, onGoToDecks }: DeckPickerProps) {
  const { t } = useTranslation();
  const totalDue = decks.reduce((acc, d) => acc + (d.dueCount || 0), 0);

  const renderItem = useCallback(({ item }: { item: DeckWithStats }) => {
    const isCustom = item.type === 'custom';
    const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode) || SUPPORTED_LANGUAGES[0];
    const dueCount = item.dueCount || 0;
    const cardsInReview = item.activeCardsCount !== undefined ? item.activeCardsCount : (item.wordCount || 0);
    const hasDue = dueCount > 0;

    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          {
            backgroundColor: colors.surface,
            borderColor: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.border,
          },
        ]}
        activeOpacity={0.75}
        onPress={() => onSelectDeck(item.id, item.name, hasDue)}
      >
        <View style={styles.gridCardTopRow}>
          {isCustom ? (
            <Ionicons
              name="layers"
              size={22}
              color="#10B981"
            />
          ) : (
            <Text style={styles.gridFlagEmoji}>{langMeta.flag}</Text>
          )}

          {hasDue ? (
            <Text
              style={[styles.gridDueText, { color: '#F59E0B' }]}
              numberOfLines={1}
            >
              {dueCount === 1 ? t('review.pendingCount', { count: dueCount }) : t('review.pendingsCount', { count: dueCount })}
            </Text>
          ) : (
            <Text
              style={[styles.gridDueText, { color: '#10B981' }]}
              numberOfLines={1}
            >
              {t('review.upToDate')}
            </Text>
          )}
        </View>

        <View style={styles.gridCardBody}>
          <Text style={[styles.gridCardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.gridCardSub, { color: colors.textMuted }]} numberOfLines={1}>
            {isCustom ? t('decks.custom') : (langMeta?.label || 'General')} • {cardsInReview}{' '}
            {cardsInReview === 1 ? (isCustom ? t('deckDetail.card') : t('deckDetail.word')) : (isCustom ? t('deckDetail.cards') : t('deckDetail.words'))}
          </Text>
        </View>

        <View style={[styles.gridCardFooter, { borderTopColor: colors.border }]}>
          <Text
            style={[
              styles.gridCardActionText,
              { color: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted },
            ]}
          >
            {hasDue ? t('review.reviewNow') : t('review.practice')}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted}
          />
        </View>
      </TouchableOpacity>
    );
  }, [colors, onSelectDeck, t]);

  return (
    <>
      {decks.length > 0 && (
        <View style={styles.selectionHeader}>
          <Text style={[styles.selectionHeadline, { color: colors.text }]}>{t('review.chooseDeckToReview')}</Text>
          <View style={[styles.selectionDueBadge, { backgroundColor: (totalDue > 0 ? colors.primary : '#10B981') + '1A' }]}>
            <Ionicons
              name={totalDue > 0 ? 'flash' : 'checkmark-circle'}
              size={14}
              color={totalDue > 0 ? colors.primary : '#10B981'}
            />
            <Text style={[styles.selectionDueText, { color: totalDue > 0 ? colors.primary : '#10B981' }]}>
              {totalDue > 0
                ? (totalDue === 1 ? t('review.pendingCard', { count: totalDue }) : t('review.pendingCards', { count: totalDue }))
                : t('review.allUpToDate')}
            </Text>
          </View>
        </View>
      )}


      {decks.length === 0 ? (
        <View style={styles.emptyGridContainer}>
          <Ionicons name="albums-outline" size={54} color={colors.textMuted} />
          <Text style={[styles.emptyGridTitle, { color: colors.text }]}>{t('review.noCardsDue')}</Text>
          <Text style={[styles.emptyGridSub, { color: colors.textMuted }]}>
            {t('review.noCardsDueSub')}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.md }]}
            onPress={onGoToDecks}
          >
            <Ionicons name="add" size={20} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.primaryBtnText}>{t('review.goToMyDecks')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContentContainer}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={3}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
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
  selectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  selectionHeadline: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  selectionDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 8,
  },
  selectionDueText: {
    fontSize: 13,
    fontWeight: '700',
  },
  gridColumnWrapper: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  gridContentContainer: {
    paddingBottom: 100,
  },
  gridCard: {
    flex: 1,
    height: 156,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  gridCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridFlagEmoji: {
    fontSize: 22,
    includeFontPadding: false,
  },
  gridDueText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gridCardBody: {
    marginVertical: Spacing.xs,
  },
  gridCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 20,
    marginBottom: 2,
  },
  gridCardSub: {
    fontSize: 12,
  },
  gridCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridCardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyGridContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: 80,
  },
  emptyGridTitle: {
    ...Typography.h2,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyGridSub: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
});
