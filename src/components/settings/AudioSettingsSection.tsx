import { Ionicons } from '@expo/vector-icons';
import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getBestVoiceForLanguage, getVoicesForLanguage, setPreferredVoice, speakText } from '../../../lib/audio-service';
import { SHERPA_MODEL_SIZE_MB } from '../../../lib/sherpa-service';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { useVoiceModelStore } from '../../stores/voiceModelStore';

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

/** Descarga / borrado del modelo de reconocimiento de voz offline. */
function SpeechModelBlock({ colors }: { colors: Colors }) {
  const { t } = useTranslation();
  const { status, percent, refresh, download, remove } = useVoiceModelStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDownload = async () => {
    const ok = await download();
    if (!ok) Alert.alert(t('audio.downloadFailed'), t('audio.downloadFailedMsg'));
  };

  const onDelete = () =>
    Alert.alert(t('audio.deleteModelConfirm'), t('audio.deleteModelMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove() },
    ]);

  const statusText =
    status === 'ready'
      ? t('audio.modelReady')
      : status === 'downloading'
        ? t('audio.modelDownloading', { percent })
        : status === 'missing'
          ? t('audio.modelMissing', { size: SHERPA_MODEL_SIZE_MB })
          : '';

  return (
    <View>
      <View style={styles.subHeader}>
        <Ionicons name="mic-outline" size={18} color={colors.primary} />
        <Text style={[styles.subTitle, { color: colors.text }]}>{t('audio.offlineSpeechTitle')}</Text>
      </View>
      <Text style={[styles.sub, { color: colors.textMuted }]}>{statusText}</Text>

      {status === 'downloading' ? (
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHighlight }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
        </View>
      ) : status === 'missing' ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={onDownload}>
          <Ionicons name="cloud-download-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>{t('audio.downloadModel', { size: SHERPA_MODEL_SIZE_MB })}</Text>
        </TouchableOpacity>
      ) : status === 'ready' ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.surfaceHighlight }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={[styles.buttonText, { color: colors.danger }]}>{t('audio.deleteModel')}</Text>
        </TouchableOpacity>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.sm }} />
      )}
      {status === 'missing' ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('audio.wifiNotice')}</Text>
      ) : null}
    </View>
  );
}

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

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <SpeechModelBlock colors={colors} />
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
  divider: { height: 1, marginVertical: Spacing.md },
  subHeader: { flexDirection: 'row', alignItems: 'center' },
  subTitle: { fontSize: 15, fontWeight: '700', marginLeft: Spacing.xs },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: Spacing.sm,
  },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: Spacing.sm },
  progressFill: { height: 8, borderRadius: 4 },
  hint: { fontSize: 11, marginTop: 6, textAlign: 'center' },
});
