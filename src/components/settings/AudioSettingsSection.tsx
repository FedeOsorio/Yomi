import { Ionicons } from '@expo/vector-icons';
import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getBestVoiceForLanguage, getVoicesForLanguage, setPreferredVoice, speakText } from '../../../lib/audio-service';
import { VOICE_MODEL_IDS, VoiceModelId, voiceModelSizeMb } from '../../../lib/sherpa-service';
import { getSpeechEnginePreference, setSpeechEnginePreference, SpeechEnginePreference } from '../../../lib/speech-recognition-service';
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

/** Idiomas que cubre cada modelo de voz offline. */
const MODEL_LABELS: Record<VoiceModelId, { flags: string; labelKeys: ('audio.langJapanese' | 'audio.langChinese' | 'audio.langEnglish')[] }> = {
  'reazon-ja': { flags: '🇯🇵', labelKeys: ['audio.langJapanese'] },
  sensevoice: { flags: '🇨🇳 🇺🇸', labelKeys: ['audio.langChinese', 'audio.langEnglish'] },
};

/** Descarga / borrado de UN modelo de reconocimiento de voz offline. */
function SpeechModelRow({ id, colors }: { id: VoiceModelId; colors: Colors }) {
  const { t } = useTranslation();
  const { status, percent } = useVoiceModelStore((s) => s.models[id]);
  const download = useVoiceModelStore((s) => s.download);
  const remove = useVoiceModelStore((s) => s.remove);
  const size = voiceModelSizeMb(id);
  const { flags, labelKeys } = MODEL_LABELS[id];

  const onDownload = async () => {
    const ok = await download(id);
    if (!ok) Alert.alert(t('audio.downloadFailed'), t('audio.downloadFailedMsg'));
  };

  const onDelete = () =>
    Alert.alert(t('audio.deleteModelConfirm'), t('audio.deleteModelMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove(id) },
    ]);

  const statusText =
    status === 'ready'
      ? t('audio.modelReady')
      : status === 'downloading'
        ? t('audio.modelDownloading', { percent })
        : status === 'missing'
          ? t('audio.modelMissing', { size })
          : '';

  return (
    <View style={[styles.modelCard, { backgroundColor: colors.surfaceHighlight }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>
        {flags}  {labelKeys.map((k) => t(k)).join(' · ')}
      </Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>{statusText}</Text>

      {status === 'downloading' ? (
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
        </View>
      ) : status === 'missing' ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={onDownload}>
          <Ionicons name="cloud-download-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>{t('audio.downloadModel', { size })}</Text>
        </TouchableOpacity>
      ) : status === 'ready' ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={[styles.buttonText, { color: colors.danger }]}>{t('audio.deleteModel')}</Text>
        </TouchableOpacity>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.sm }} />
      )}
    </View>
  );
}

/** Selector de motor y modelos de reconocimiento de voz. */
function SpeechModelBlock({ colors }: { colors: Colors }) {
  const { t } = useTranslation();
  const refresh = useVoiceModelStore((s) => s.refresh);
  const anyMissing = useVoiceModelStore((s) => VOICE_MODEL_IDS.some((id) => s.models[id].status === 'missing'));
  const [enginePref, setEnginePref] = useState<SpeechEnginePreference>('native');

  useEffect(() => {
    refresh();
    getSpeechEnginePreference().then(setEnginePref);
  }, [refresh]);

  const handleSelectEngine = async (pref: SpeechEnginePreference) => {
    setEnginePref(pref);
    await setSpeechEnginePreference(pref);
  };

  return (
    <View>
      <View style={styles.subHeader}>
        <Ionicons name="mic-outline" size={18} color={colors.primary} />
        <Text style={[styles.subTitle, { color: colors.text }]}>Motor de reconocimiento de voz</Text>
      </View>
      <Text style={[styles.sub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
        Elige qué servicio procesa tu pronunciación durante el repaso:
      </Text>

      {/* Selector de modo */}
      <View style={[styles.segmentedContainer, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.segmentBtn, enginePref === 'native' && { backgroundColor: colors.primary }]}
          onPress={() => handleSelectEngine('native')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, { color: enginePref === 'native' ? '#FFF' : colors.textMuted }]}>
            Nativo (Google / Sistema)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, enginePref === 'offline' && { backgroundColor: colors.primary }]}
          onPress={() => handleSelectEngine('offline')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, { color: enginePref === 'offline' ? '#FFF' : colors.textMuted }]}>
            Offline (Sherpa-ONNX)
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.engineDesc, { color: colors.textMuted }]}>
        {enginePref === 'native'
          ? '⭐ Recomendado: usa el reconocedor nativo del teléfono (Google en Android, Siri en iOS). Máxima precisión, cancela ruidos de fondo y no inventa palabras.'
          : 'Reconocimiento 100% offline en el dispositivo. Requiere descargar el paquete de voz correspondiente a continuación.'}
      </Text>

      {enginePref === 'offline' && (
        <View style={{ marginTop: Spacing.md }}>
          <Text style={[styles.subTitle, { color: colors.text, fontSize: 13, marginBottom: 4 }]}>
            Paquetes offline descargados:
          </Text>
          {VOICE_MODEL_IDS.map((id) => (
            <SpeechModelRow key={id} id={id} colors={colors} />
          ))}
          {anyMissing ? <Text style={[styles.hint, { color: colors.textMuted }]}>{t('audio.wifiNotice')}</Text> : null}
        </View>
      )}
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
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    marginVertical: Spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  engineDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
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
  modelCard: { borderRadius: 10, padding: Spacing.sm, marginTop: Spacing.sm },
});
