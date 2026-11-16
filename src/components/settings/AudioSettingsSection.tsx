import { Ionicons } from '@expo/vector-icons';
import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getBestVoiceForLanguage, getVoicesForLanguage, setPreferredVoice, speakText } from '../../../lib/audio-service';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';

type Colors = {
  surface: string;
  surfaceHighlight: string;
  border: string;
  primary: string;
  text: string;
  textMuted: string;
  danger: string;
};

const LANGUAGES = [
  { code: 'ja-JP', flag: '🇯🇵', labelKey: 'audio.langJapanese' as const, sample: 'こんにちは' },
  { code: 'zh-CN', flag: '🇨🇳', labelKey: 'audio.langChinese' as const, sample: '你好' },
  { code: 'en-US', flag: '🇺🇸', labelKey: 'audio.langEnglish' as const, sample: 'Hello' },
];

/** Una fila por idioma: probar la voz y elegir entre las voces instaladas en el teléfono. */
function VoiceRow({ lang, colors }: { lang: (typeof LANGUAGES)[number]; colors: Colors }) {
  const { t } = useTranslation();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const list = await getVoicesForLanguage(lang.code);
      const current = await getBestVoiceForLanguage(lang.code);
      setVoices(list);
      setIndex(Math.max(0, list.findIndex((v) => v.identifier === current)));
    })();
  }, [lang.code]);

  const changeVoice = async (step: number) => {
    if (voices.length < 2) return;
    const next = (index + step + voices.length) % voices.length;
    setIndex(next);
    await setPreferredVoice(lang.code, voices[next].identifier);
    speakText(lang.sample, lang.code);
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceHighlight }]}>
      <TouchableOpacity style={styles.rowMain} onPress={() => speakText(lang.sample, lang.code)}>
        <Text style={styles.flag}>{lang.flag}</Text>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{t(lang.labelKey)}</Text>
        <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
      {voices.length > 1 ? (
        <View style={styles.voicePicker}>
          <TouchableOpacity onPress={() => changeVoice(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.voiceLabel, { color: colors.textMuted }]}>
            {t('audio.voiceItem', { current: index + 1, total: voices.length })}
          </Text>
          <TouchableOpacity onPress={() => changeVoice(1)} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** Configuración › Prueba de audio: las voces con que la app lee en cada idioma. */
export function AudioSettingsSection({ colors, highlighted = false }: { colors: Colors; highlighted?: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: highlighted ? colors.primary : colors.border },
        highlighted && styles.cardHighlighted,
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>{t('audio.title')}</Text>
      </View>
      <Text style={[styles.sub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
        {t('audio.ttsDesc')}
      </Text>
      {LANGUAGES.map((lang) => (
        <VoiceRow key={lang.code} lang={lang} colors={colors} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  cardHighlighted: { borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  title: { fontSize: 16, fontWeight: '700', marginLeft: Spacing.xs },
  sub: { fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    marginBottom: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1, padding: Spacing.sm },
  flag: { fontSize: 18, marginRight: Spacing.sm },
  rowLabel: { fontSize: 14, fontWeight: '500', marginRight: Spacing.xs },
  voicePicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceLabel: { fontSize: 12, fontWeight: '600', minWidth: 52, textAlign: 'center' },
});
