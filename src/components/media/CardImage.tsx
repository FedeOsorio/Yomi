import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, Pressable, StyleProp, ViewStyle, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface CardImageProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  aspectRatio?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function CardImage({ uri, style, aspectRatio = 16 / 9 }: CardImageProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setIsFullscreen(true)}
        style={[styles.container, { aspectRatio }, style]}
      >
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
        <View style={styles.zoomHintBadge}>
          <Ionicons name="expand-outline" size={14} color="#FFF" />
        </View>
      </TouchableOpacity>

      {/* Modal a pantalla completa */}
      <Modal
        visible={isFullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFullscreen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsFullscreen(false)}>
          <View style={styles.closeBtn}>
            <Ionicons name="close-circle" size={32} color="#FFF" />
          </View>
          <Image
            source={{ uri }}
            style={styles.fullscreenImage}
            contentFit="contain"
          />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxHeight: 220,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
    marginVertical: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH * 0.95,
    height: SCREEN_HEIGHT * 0.85,
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
});
