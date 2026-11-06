import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { cancelAnimation, Easing, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Rating } from 'ts-fsrs';
import { speakCard, stopSpeech } from '../../../lib/audio-service';
import { getEffectiveCardLanguage } from '../../../lib/japanese-utils';
import { detectMeaningLocale } from '../../../lib/meaning-language';
import { registerWordInDictionary } from '../../../lib/phonetic-dictionary';
import { calculateChineseAccuracyScore } from '../../../lib/pinyin-utils';
import {
  ANSWER_VISIBLE_MS,
  initialVoiceFlow,
  MAX_VOICE_ATTEMPTS,
  MicStatus,
  micStatusOf,
  SPEECH_SAFETY_MS,
  stepVoiceFlow,
  VOICE_TIMEOUT_MS,
  VoiceEffect,
  VoiceEvent,
  VoiceFlowState,
} from '../../../lib/review-flow';
import { MODEL_NOT_DOWNLOADED, sherpaVoiceService } from '../../../lib/sherpa-service';
import { getSpeechEnginePreference, speechService, usesOfflineModel } from '../../../lib/speech-recognition-service';
import {
  asksForMeaning,
  checkMeaningMatch,
  checkVoiceMatch,
  DueCardWithContext,
  getCardMeaningTargets,
  isCustomReviewCard,
} from '../../../lib/srs-engine';
import { expectedVoiceWords } from '../../../lib/voice-match';
import { getUserSpeechLocale, useTranslation } from '../../i18n';
import { CardEvaluation, useReviewStore } from '../../stores/reviewStore';
import { useSingleNavigation } from '../useSingleNavigation';
import type { useAutoAdvance } from './useAutoAdvance';
import type { useCardFlip } from './useCardFlip';

/** Signos que se ignoran al reconocer la alucinación "はい". */
const NOISE = /[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()[\]【】]/g;

/** Significados como lista (vienen como JSON o separados por comas), para dárselos de pista al reconocedor. */
const parseMeaningList = (meanings: string): string[] => {
  try {
    const parsed = JSON.parse(meanings);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return meanings.split(/[,;、]/).map((m) => m.trim()).filter(Boolean);
};

/**
 * Repaso manos libres. Las decisiones (cuándo abrir el micrófono, cuándo evaluar, cuándo pasar de tarjeta)
 * las toma el recorrido de lib/review-flow.ts; este hook solo ejecuta lo que pide (micrófono, voz, giro,
 * cuenta, guardar) y le avisa los resultados.
 */
export function useVoiceReview(flip: ReturnType<typeof useCardFlip>, autoAdvance: ReturnType<typeof useAutoAdvance>) {
  const { t } = useTranslation();
  // Un solo movimiento por vez: varios toques rápidos no abren pantallas repetidas ni vuelven atrás de más
  const router = useSingleNavigation();
  const store = useReviewStore.getState;
  // Cómo se ve el micrófono (sale del recorrido)
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const isListening = micStatus === 'listening';

  // Texto mientras se carga el modelo de voz (null = listo / inactivo)
  const [setupLabel, setSetupLabel] = useState<string | null>(null);
  // Aviso bajo la transcripción ("No coincide · intento 1 de 3")
  const [feedback, setFeedback] = useState<string | null>(null);
  // Idioma cuyo modelo de voz falta (null = no hay aviso abierto)
  const [modelRequiredLang, setModelRequiredLang] = useState<string | null>(null);

  // Tiempo de la tarjeta (anillo de 15 s) y "respiración" del botón mientras escucha (Reanimated)
  const micProgress = useSharedValue(0);
  const micPulse = useSharedValue(1);

  const flow = useRef<VoiceFlowState>(initialVoiceFlow);
  // Respuesta evaluada pero aún no guardada en el SRS. Se guarda al pasar de tarjeta,
  // para que el usuario pueda "Marcar incorrecta" un acierto que el reconocedor dio por bueno.
  const pendingReview = useRef<{ cardId: string; rating: Rating; wasFailedInSession: boolean } | null>(null);
  // Idioma de los significados de cada mazo (se calcula una vez por mazo con todas sus tarjetas de la sesión)
  const meaningLocaleByDeck = useRef(new Map<string, string>());

  useEffect(() => {
    if (!isListening) {
      cancelAnimation(micPulse);
      micPulse.value = 1;
      return;
    }
    const breathe = (toValue: number) => withTiming(toValue, { duration: 900, easing: Easing.inOut(Easing.ease) });
    micPulse.value = withRepeat(withSequence(breathe(1.07), breathe(1)), -1);
    return () => cancelAnimation(micPulse);
  }, [isListening]);

  // ───────────── Recorrido ─────────────

  function dispatch(event: VoiceEvent) {
    const { state, effects } = stepVoiceFlow(flow.current, event);
    flow.current = state;
    setMicStatus(micStatusOf(state));
    effects.forEach(run);
  }

  function run(effect: VoiceEffect) {
    const card = store().getCurrentCard();
    switch (effect.type) {
      case 'openMic':
        if (card) listen(card, effect.session);
        break;
      case 'closeMic':
        speechService.abort().catch(() => {});
        break;
      case 'startTimer': {
        const { turn } = effect;
        micProgress.value = 0;
        micProgress.value = withTiming(1, { duration: VOICE_TIMEOUT_MS, easing: Easing.linear }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(dispatch, { type: 'timeUp', turn });
        });
        break;
      }
      case 'stopTimer':
        cancelAnimation(micProgress);
        break;
      case 'feedback':
        setFeedback(`No coincide · intento ${effect.attempt} de ${MAX_VOICE_ATTEMPTS}`);
        break;
      case 'reveal':
        if (card) reveal(card, effect.turn, effect.correct, effect.reading);
        break;
      case 'speak': {
        if (!card) break;
        const { turn } = effect;
        const done = () => dispatch({ type: 'speechDone', turn });
        // Si la voz no avisa que terminó (algunos motores no lo hacen), se sigue igual
        setTimeout(done, SPEECH_SAFETY_MS);
        speakCard(card, getEffectiveCardLanguage(card), {
          reading: effect.reading ?? card.displayReading,
          onDone: done,
          onError: done,
          onStopped: done,
        });
        break;
      }
      case 'stopSpeech':
        stopSpeech();
        break;
      case 'startCountdown': {
        const { turn } = effect;
        autoAdvance.start(ANSWER_VISIBLE_MS, () => dispatch({ type: 'countdownDone', turn }));
        break;
      }
      case 'cancelCountdown':
        autoAdvance.cancel();
        break;
      case 'markIncorrect': {
        const { evaluation } = store();
        store().answerCurrentCard(Rating.Again);
        if (pendingReview.current) pendingReview.current.rating = Rating.Again;
        if (evaluation) {
          store().setEvaluation({ ...evaluation, isReadingCorrect: false, isMeaningCorrect: false, computedRating: Rating.Again, matchedReading: undefined });
        }
        break;
      }
      case 'saveAnswer':
        saveAnswer();
        break;
      case 'advance': {
        const { turn } = effect;
        // El contenido cambia a mitad del giro, con la tarjeta de perfil
        let moved = false;
        const moveToNext = () => {
          if (moved) return;
          moved = true;
          store().advanceCard();
        };
        flip.showFront(
          300,
          () => {
            moveToNext();
            const s = store();
            const next = s.sessionCompleted ? null : s.getCurrentCard();
            dispatch({ type: 'advanced', turn, next: !next ? 'end' : isCustomReviewCard(next) ? 'buttons' : 'voice' });
          },
          moveToNext
        );
        break;
      }
      case 'resetCard':
        setFeedback(null);
        store().setSpeechTranscript('');
        cancelAnimation(micProgress);
        micProgress.value = 0;
        break;
    }
  }

  /** Registra el resultado de la tarjeta y la gira al dorso. */
  function reveal(card: DueCardWithContext, turn: number, correct: boolean, matchedReading?: string) {
    setFeedback(null);
    store().setIsChecked(true);

    let voiceScore: CardEvaluation['voiceScore'];
    // Precisión por sílaba solo en chino (el reconocedor no mide el acento tonal del japonés)
    if (getEffectiveCardLanguage(card).startsWith('zh')) {
      const recognized = matchedReading || store().speechTranscript || '';
      const res = calculateChineseAccuracyScore(recognized, card.displayText, card.displayReading);
      voiceScore = { score: res.score, label: res.label, breakdown: res.breakdown };
    }
    const rating = correct ? Rating.Good : Rating.Again;
    store().setEvaluation({ isReadingCorrect: correct, isMeaningCorrect: correct, computedRating: rating, voiceScore, matchedReading });
    const { wasFailedInSession } = store().answerCurrentCard(rating);
    pendingReview.current = { cardId: card.id, rating, wasFailedInSession };

    flip.showBack(300, () => dispatch({ type: 'flipDone', turn }));
  }

  function saveAnswer() {
    const pending = pendingReview.current;
    pendingReview.current = null;
    if (!pending) return;
    store()
      .saveCardReview(pending.cardId, pending.rating, pending.wasFailedInSession)
      .catch((err) => console.warn('Error al procesar FSRS:', err));
  }

  /** Idioma en que se responde el significado: el de los significados del mazo, o el de la app si no se distingue. */
  function meaningSpeechLocale(card: DueCardWithContext): string {
    const deckKey = card.deckId ?? '';
    const cached = meaningLocaleByDeck.current.get(deckKey);
    if (cached) return cached;
    const meanings = store()
      .dueCards.filter((c) => (c.deckId ?? '') === deckKey)
      .map((c) => getCardMeaningTargets(c));
    const locale = detectMeaningLocale(meanings) ?? getUserSpeechLocale();
    meaningLocaleByDeck.current.set(deckKey, locale);
    return locale;
  }

  /** Abre el micrófono (apertura `session`) y le avisa al recorrido lo que pasa. */
  async function listen(card: DueCardWithContext, session: number) {
    const lang = getEffectiveCardLanguage(card);
    // Respuesta = significado: se escucha en el idioma de los significados del mazo (no en japonés)
    const meaningMode = asksForMeaning(card);
    const listenLang = meaningMode ? meaningSpeechLocale(card) : lang;
    const meaningTargets = meaningMode ? getCardMeaningTargets(card) : '';
    const hints = meaningMode ? parseMeaningList(meaningTargets) : expectedVoiceWords(card, lang);
    const isCurrent = () => flow.current.session === session;
    let reportedError = false;

    console.log('[ReviewVoice] Escuchando tarjeta:', card.displayText);
    registerWordInDictionary(card.displayText, card.displayReading);
    speechService.invalidate();

    const started = await speechService.start(
      listenLang,
      {
        onStart: () => dispatch({ type: 'micStarted', session }),
        onResult: (transcript, isFinal, alternatives = []) => {
          if (!isCurrent()) return;
          // Si el motor transcribe "はい" como alucinación y la tarjeta no lo espera, se ignora para no quemar intentos
          if (!meaningMode && lang.startsWith('ja') && /^(はい|はいはい|はーい)$/.test(transcript.replace(NOISE, ''))) {
            const expectsHai = hints.some((w) => ['はい', 'はいはい', '灰', '杯', '拝', '配'].includes(w.replace(NOISE, '')));
            if (!expectsHai) return;
          }
          // Probar la transcripción principal y todas las alternativas que entregó el reconocedor
          const candidates = Array.from(new Set([transcript, ...alternatives].filter(Boolean)));
          let match: ReturnType<typeof checkVoiceMatch> | null = null;
          if (meaningMode) {
            if (candidates.some((c) => checkMeaningMatch(meaningTargets, c))) match = { isMatch: true, heard: transcript };
          } else {
            match = candidates.map((c) => checkVoiceMatch(card, c, lang)).find((r) => r.isMatch) ?? null;
          }
          const shown = match ?? (meaningMode ? null : checkVoiceMatch(card, transcript, lang));
          store().setSpeechTranscript(shown?.heard || transcript);
          dispatch({ type: 'heard', session, match: Boolean(match), final: isFinal, reading: match?.matchedReading });
        },
        onError: (err) => {
          if (!isCurrent()) return;
          reportedError = true;
          if (err === MODEL_NOT_DOWNLOADED) setModelRequiredLang(listenLang);
          else Alert.alert(t('review.micErrorTitle'), err || t('review.micErrorDefault'));
          dispatch({ type: 'micError', session });
        },
        onEnd: () => dispatch({ type: 'micClosed', session }),
      },
      { contextualStrings: hints }
    );

    // No se pudo abrir (también al reabrirse solo). Si el usuario lo apagó mientras se abría, no hay nada que avisar
    const stillWanted = flow.current.phase === 'starting' || flow.current.phase === 'listening';
    if (!started && isCurrent() && stillWanted) {
      if (!reportedError) Alert.alert(t('review.micNotStartedTitle'), t('review.micNotStartedMsg'));
      dispatch({ type: 'micNotStarted', session });
    }
  }

  // ───────────── Preparación ─────────────

  const goToModelDownload = () => {
    setModelRequiredLang(null);
    router.push({ pathname: '/profile', params: { section: 'audio' } });
  };

  /** Carga en memoria el modelo de voz (ya descargado) para el idioma si está en modo offline. */
  const prepareModel = async (lang: string): Promise<boolean> => {
    const pref = await getSpeechEnginePreference();
    if (pref !== 'offline' || !usesOfflineModel(lang) || sherpaVoiceService.isReady(lang)) return true;
    setSetupLabel(t('review.loadingVoiceEngine'));
    try {
      const loaded = await sherpaVoiceService.loadModel(lang);
      if (!loaded && sherpaVoiceService.lastError === MODEL_NOT_DOWNLOADED) setModelRequiredLang(lang);
      else if (!loaded) Alert.alert(t('review.voiceEngineTitle'), sherpaVoiceService.lastError ?? t('review.voiceEngineError'));
      return loaded;
    } finally {
      setSetupLabel(null);
    }
  };

  /**
   * Antes de empezar una sesión por voz: permiso de micrófono y modelo descargado (si se usa modo offline).
   * Devuelve false (y avisa) si no se puede empezar.
   */
  const ensureReady = async (lang: string, onModelMissing: () => void): Promise<boolean> => {
    const hasPerm = (await speechService.checkPermissions()) || (await speechService.requestPermissions());
    if (!hasPerm) {
      Alert.alert(t('review.micPermissionTitle'), t('review.micPermissionMsg'));
      return false;
    }
    if ((await getSpeechEnginePreference()) === 'offline' && !(await sherpaVoiceService.hasModelFor(lang))) {
      onModelMissing();
      // Esperar a que cierre el modal de opciones antes de abrir el aviso (dos Modal a la vez fallan en Android)
      setTimeout(() => setModelRequiredLang(lang), 250);
      return false;
    }
    return true;
  };

  return {
    micStatus,
    isListening,
    setupLabel,
    feedback,
    micProgress,
    micPulse,
    showModelRequired: modelRequiredLang !== null,
    modelRequiredLang,
    closeModelRequired: () => setModelRequiredLang(null),
    goToModelDownload,
    ensureReady,
    prepareModel,
    /** Botón del micrófono (mientras se carga el modelo no hace nada) */
    toggleMic: () => setupLabel === null && dispatch({ type: 'micPressed' }),
    /** "No lo sé" */
    giveUp: () => dispatch({ type: 'giveUp' }),
    markIncorrect: () => dispatch({ type: 'markIncorrect' }),
    /** "Siguiente" */
    next: () => dispatch({ type: 'nextPressed' }),
    /** Hay una tarjeta nueva en pantalla que no llegó pasando por voz (inicio de sesión, botones) */
    cardShown: () => dispatch({ type: 'cardShown' }),
    /** La pantalla perdió el foco o la app pasó a segundo plano */
    interrupt: () => dispatch({ type: 'interrupted' }),
    /** El usuario sale de la sesión */
    endSession: () => {
      dispatch({ type: 'interrupted' });
      saveAnswer();
      dispatch({ type: 'cardShown' });
      flip.reset();
    },
  };
}
