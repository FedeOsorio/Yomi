import { Ionicons } from '@expo/vector-icons';
import { Fragment, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Folder } from '../../../lib/deck-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';

/** Ruta "Inicio › Carpeta › Subcarpeta". Cada tramo se puede tocar para volver ahí. */
export function FolderBreadcrumb({ path, onNavigate }: { path: Folder[]; onNavigate: (folderId: string | null) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <TouchableOpacity style={styles.crumb} onPress={() => onNavigate(null)} hitSlop={{ top: 8, bottom: 8 }}>
          <Ionicons name="home-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.text, { color: colors.textMuted }]}>{t('folders.home')}</Text>
        </TouchableOpacity>
        {path.map((folder, i) => {
          const isLast = i === path.length - 1;
          return (
            <Fragment key={folder.id}>
              <Ionicons name="chevron-forward" size={13} color={colors.textMuted} style={styles.separator} />
              <TouchableOpacity
                style={[styles.crumb, isLast && { backgroundColor: `${folder.color || colors.primary}22` }]}
                disabled={isLast}
                onPress={() => onNavigate(folder.id)}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                {isLast && <Ionicons name="folder-open" size={14} color={folder.color || colors.primary} />}
                <Text
                  style={[styles.text, { color: isLast ? colors.text : colors.textMuted }, isLast && styles.current]}
                  numberOfLines={1}
                >
                  {folder.name}
                </Text>
              </TouchableOpacity>
            </Fragment>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: 180,
  },
  separator: {
    marginHorizontal: 1,
  },
  text: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  current: {
    fontWeight: '800',
  },
});
