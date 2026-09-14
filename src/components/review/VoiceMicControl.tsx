import React, { memo } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '../../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCLE_RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export interface VoiceMicControlProps {
  isListening: boolean;
  speechStatus: 'idle' | 'listening' | 'evaluating' | 'correct' | 'incorrect';
  voiceProgressAnim: Animated.Value;
  micPulseAnim: Animated.Value;
  colors: {
    primary: string;
    primaryHover?: string;
    surfaceHighlight: string;
    border: string;
    textMuted: string;
  };
  onPress: () => void;
}

export const VoiceMicControl = memo(function VoiceMicControl({
  isListening,
  speechStatus,
  voiceProgressAnim,
  micPulseAnim,
  colors,
  onPress,
}: VoiceMicControlProps) {
  return (
    <>
      <View style={styles.micCircleWrapper}>
        <Svg width={106} height={106} style={styles.micSvgRing}>
          {/* Círculo de fondo tenue */}
          <Circle
            cx="53"
            cy="53"
            r={CIRCLE_RADIUS}
            stroke={colors.surfaceHighlight}
            strokeWidth="3.5"
            fill="none"
          />
          {/* Círculo de progreso continuo a 60 FPS */}
          <AnimatedCircle
            cx="53"
            cy="53"
            r={CIRCLE_RADIUS}
            stroke={colors.primary}
            strokeWidth="4.5"
            strokeDasharray={`${CIRCUMFERENCE}`}
            strokeDashoffset={voiceProgressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [CIRCUMFERENCE, 0],
            })}
            strokeLinecap="round"
            fill="none"
            transform="rotate(-90 53 53)"
          />
        </Svg>

        {/* Botón flotante con halo suave de pulsación sin elevation */}
        <Animated.View
          style={[
            styles.micFloatingAura,
            {
              backgroundColor: isListening ? colors.primary + '16' : 'transparent',
              transform: [{ scale: micPulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.floatingMicButton,
              {
                backgroundColor: isListening ? colors.primary : colors.surfaceHighlight,
                borderColor: isListening ? (colors.primaryHover || colors.primary) : colors.border,
              },
            ]}
            activeOpacity={0.8}
            onPress={onPress}
          >
            <Ionicons
              name={isListening ? 'mic' : 'mic-outline'}
              size={38}
              color={isListening ? '#FFF' : colors.primary}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Text style={[styles.floatingMicHintText, { color: colors.textMuted }]}>
        {speechStatus === 'listening'
          ? 'Escuchando tu pronunciación...'
          : speechStatus === 'evaluating'
            ? 'Evaluando respuesta...'
            : 'Toca el micrófono para comenzar'}
      </Text>
    </>
  );
});

const styles = StyleSheet.create({
  micCircleWrapper: {
    width: 106,
    height: 106,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  micSvgRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  micFloatingAura: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingMicButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingMicHintText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
});
