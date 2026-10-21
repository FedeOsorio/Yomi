import { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface CardVideoProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
}

export function CardVideo({ uri, style, autoPlay = false }: CardVideoProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) {
      p.play();
    }
  });

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        surfaceType="textureView"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture={false}
        contentFit="contain"
        style={styles.video}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 220,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginVertical: 8,
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
