import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { Spacing } from '../../constants/theme';

/** Hoja inferior simple (mismo estilo que el menú "+" del inicio). Se cierra tocando afuera. */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        </Animated.View>
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    maxHeight: '80%',
  },
});
