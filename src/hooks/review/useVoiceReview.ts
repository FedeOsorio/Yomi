import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing } from 'react-native';
import { Rating } from 'ts-fsrs';
import { speakCard, stopSpeech } from '../../../lib/audio-service';
import { getEffectiveCardLanguage } from '../../../lib/japanese-utils';
import { registerWordInDictionary } from '../../../lib/phonetic-dictionary';
import { calculateChineseAccuracyScore } from '../../../lib/pinyin-utils';
import { MODEL_NOT_DOWNLOADED, sherpaVoiceService } from '../../../lib/sherpa-service';
import { expectedVoiceWords } from '../../../lib/voice-match';
import { getSpeechEnginePreference, speechService, usesOfflineModel } from '../../../lib/speech-recognition-service';
import { checkVoiceMatch, DueCardWithContext, isCustomReviewCard } from '../../../lib/srs-engine';
import { hasAnkiCardRef } from '../../../lib/word-aux';
import { CardEvaluation, useReviewStore } from '../../stores/reviewStore';
import { useTranslation } from '../../i18n';
import type { useAutoAdvance } from './useAutoAdvance';
import type { useCardFlip } from './useCardFlip';

/** Segundos que tiene el usuario para pronunciar cada tarjeta. */
const VOICE_TIMEOUT_SECONDS = 15;
/** Intentos de pronunciación por tarjeta antes de darla por fallada. */
const MAX_VOICE_ATTEMPTS = 3;
/** Tiempo con la respuesta a la vista antes de pasar sola a la siguiente tarjeta. */
const ANSWER_VISIBLE_MS = 7000;
/** Tope para los audios del dorso del mazo (AnkiCardView): si no avisan, se avanza igual. */
const DECK_AUDIO_MAX_MS = 20000;

/** Palabras esperadas de la tarjeta: sesgan el reconocedor (pistas del modelo japonés). */
const getContextualStrings = (card: DueCardWithContext): string[] => expectedVoiceWords(card, getEffectiveCardLanguage(card));

/**
 * Repaso manos libres: micrófono, intentos, límite de tiempo, evaluación y paso automático
 * a la siguiente tarjeta. Todo el estado de voz de la pantalla de repaso vive acá.
 */
export function useVoiceReview(flip: ReturnType<typeof useCardFlip>, autoAdvance: ReturnType<typeof useAutoAdvance>) {
  const { t } = useTranslation();
  const router = useRouter();
  const isListening = useReviewStore((s) => s.isListening);
  const store = useReviewStore.getState;
  const { setIsListening, setSpeechStatus, setSpeechTranscript, setIsChecked, setEvaluation } = useReviewStore.getState();

  // Texto mientras se carga el modelo de voz (null = listo / inactivo)
  const [setupLabel, setSetupLabel] = useState<string | null>(null);
  // Aviso bajo la transcripción ("No coincide · intento 1 de 3")
  const [feedback, setFeedback] = useState<string | null>(null);
  // Idioma cuyo modelo de voz falta (null = no hay aviso abierto)
  const [modelRequiredLang, setModelRequiredLang] = useState<string | null>(null);

  // Barra de 15 s alrededor del micrófono y "respiración" del botón mientras escucha
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // true cuando la tarjeta actual ya se evaluó: descarta resultados tardíos del reconocedor
  const isCardEvaluated = useRef(false);
  // Intentos usados en la tarjeta actual. Se conservan si el usuario detiene y reactiva el micrófono.
  const attempts = useRef<{ cardId: string; count: number }>({ cardId: '', count: 0 });
  // Respuesta evaluada pero aún no guardada en el SRS. Se guarda al pasar de tarjeta,
  // para que el usuario pueda "Marcar incorrecta" un acierto que el reconocedor dio por bueno.
  const pendingReview = useRef<{ cardId: string; rating: Rating; wasFailedInSession: boolean } | null>(null);
  // Espera de los audios del dorso del mazo (tarjetas de Anki): done arranca la cuenta para avanzar,
  // cancel la descarta (se pasó de tarjeta o se cortó la sesión antes de que terminaran)
  const deckAudioWaitRef = useRef<{ done: () => void; cancel: () => void } | null>(null);

  /** Cancela la cuenta para avanzar y la espera de los audios del mazo, que la arrancaría después. */
  const cancelAdvance = () => {
    deckAudioWaitRef.current?.cancel();
    autoAdvance.cancel();
  };

  useEffect(() => {
    if (!isListening) {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = (toValue: number) =>
      Animated.timing(pulseAnim, { toValue, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const animation = Animated.loop(Animated.sequence([pulse(1.07), pulse(1)]));
    animation.start();
    return () => animation.stop();
  }, [isListening]);

  const flushPendingReview = () => {
    const pending = pendingReview.current;
    pendingReview.current = null;
    if (!pending) return;
    store()
      .saveCardReview(pending.cardId, pending.rating, pending.wasFailedInSession)
      .catch((err) => console.warn('Error al procesar FSRS:', err));
  };

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
    const pref = await getSpeechEnginePreference();
    if (pref === 'offline') {
      if (!(await sherpaVoiceService.hasModelFor(lang))) {
        onModelMissing();
        // Esperar a que cierre el modal de opciones antes de abrir el aviso (dos Modal a la vez fallan en Android)
        setTimeout(() => setModelRequiredLang(lang), 250);
        return false;
      }
    }
    return true;
  };

  /** Evalúa la tarjeta (acierto o fallo), la gira y deja la respuesta pendiente de guardar. */
  const evaluate = (card: DueCardWithContext, isSuccess: boolean, matchedReading?: string) => {
    isCardEvaluated.current = true;
    progressAnim.stopAnimation();
    setFeedback(null);
    attempts.current = { cardId: '', count: 0 }; // la próxima vez que aparezca empieza de cero

    speechService.abort().catch(() => {});
    setIsListening(false);
    setSpeechStatus(isSuccess ? 'correct' : 'incorrect');
    setIsChecked(true);

    const lang = getEffectiveCardLanguage(card);
    let voiceScore: CardEvaluation['voiceScore'];
    // Precisión por sílaba solo en chino (el reconocedor no mide el acento tonal del japonés)
    if (lang.startsWith('zh')) {
      const recognized = matchedReading || store().speechTranscript || '';
      const res = calculateChineseAccuracyScore(recognized, card.displayText, card.displayReading);
      voiceScore = { score: res.score, label: res.label, breakdown: res.breakdown };
    }

    const rating = isSuccess ? Rating.Good : Rating.Again;
    setEvaluation({
      isReadingCorrect: isSuccess,
      isMeaningCorrect: isSuccess,
      computedRating: rating,
      voiceScore,
      matchedReading: isSuccess ? matchedReading : undefined,
    });

    const { wasFailedInSession } = store().answerCurrentCard(rating);
    pendingReview.current = { cardId: card.id, rating, wasFailedInSession };

    // Al terminar el giro: leer la palabra (con la lectura que dijo el usuario si acertó) y arrancar la cuenta
    flip.showBack(300, () => {
      let advanceTriggered = false;
      const triggerAdvance = () => {
        if (advanceTriggered) return;
        advanceTriggered = true;
        autoAdvance.start(ANSWER_VISIBLE_MS, advance);
      };

      // Tarjeta de un mazo de Anki: suenan los audios del dorso del mazo (el visor de abajo), no la lectura
      // de Yomi; la cuenta arranca cuando terminan (deckAudioDone)
      if (hasAnkiCardRef(card.auxiliaryInfo)) {
        const deckAudioTimeout = setTimeout(triggerAdvance, DECK_AUDIO_MAX_MS);
        const stopWaiting = () => {
          clearTimeout(deckAudioTimeout);
          deckAudioWaitRef.current = null;
        };
        deckAudioWaitRef.current = {
          done: () => {
            stopWaiting();
            triggerAdvance();
          },
          cancel: stopWaiting,
        };
        return;
      }

      // Temporizador de seguridad: si el audio tarda más de 5 s o no emite eventos, avanzar de todos modos
      const safetyTimeout = setTimeout(triggerAdvance, 5000);

      speakCard(card, lang, {
        reading: isSuccess && matchedReading ? matchedReading : card.displayReading,
        onDone: () => {
          clearTimeout(safetyTimeout);
          triggerAdvance();
        },
        onError: () => {
          clearTimeout(safetyTimeout);
          triggerAdvance();
        },
        onStopped: () => {
          clearTimeout(safetyTimeout);
          triggerAdvance();
        },
      });
    });
  };

  /** El reconocedor dio por buena la respuesta pero el usuario sabe que la dijo mal. */
  const markIncorrect = () => {
    const { evaluation } = store();
    if (!evaluation?.isReadingCorrect) return;
    store().answerCurrentCard(Rating.Again);
    if (pendingReview.current) pendingReview.current.rating = Rating.Again;
    setSpeechStatus('incorrect');
    setEvaluation({ ...evaluation, isReadingCorrect: false, isMeaningCorrect: false, computedRating: Rating.Again, matchedReading: undefined });
  };

  /** Abre el micrófono para la tarjeta, con 15 s y hasta 3 intentos. */
  const startListening = async (card: DueCardWithContext, lang: string) => {
    stopSpeech();
    cancelAdvance();
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    flip.reset();

    // Cualquier resultado tardío de la tarjeta anterior queda descartado
    speechService.invalidate();
    const generation = speechService.getGeneration();
    isCardEvaluated.current = false;
    const isStale = () => speechService.getGeneration() !== generation || isCardEvaluated.current;

    setSpeechTranscript('');
    setIsListening(false);
    setSpeechStatus('starting');

    let timerStarted = false;
    const startTimeout = () => {
      if (timerStarted || isStale()) return;
      timerStarted = true;
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: VOICE_TIMEOUT_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !isStale()) evaluate(card, false);
      });
    };

    console.log('[ReviewVoice] Escuchando tarjeta:', card.displayText);
    registerWordInDictionary(card.displayText, card.displayReading);
    if (attempts.current.cardId !== card.id) {
      attempts.current = { cardId: card.id, count: 0 };
      setFeedback(null);
    }
    let reportedError: string | null = null;

    const started = await speechService.start(
      lang,
      {
        onStart: () => {
          if (isStale()) return;
          startTimeout();
          setIsListening(true);
          setSpeechStatus('listening');
        },
        onResult: (transcript, isFinal, alternatives = []) => {
          if (isStale()) return;

          // Si el motor transcribe "はい" como alucinación y la tarjeta no lo espera, se ignora para no quemar intentos
          if (lang.startsWith('ja') && /^(はい|はいはい|はーい)$/.test(transcript.replace(/[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()[\]【】]/g, ''))) {
            const expectsHai = getContextualStrings(card).some((w) => {
              const c = w.replace(/[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()[\]【】]/g, '');
              return c === 'はい' || c === 'はいはい' || c === '灰' || c === '杯' || c === '拝' || c === '配';
            });
            if (!expectsHai) {
              console.log('[ReviewVoice] Ignorando alucinación "はい" en la tarjeta actual');
              return;
            }
          }

          // Probar la transcripción principal y todas las alternativas que entregó el reconocedor
          const candidates = Array.from(new Set([transcript, ...alternatives].filter(Boolean)));
          let matchResult: ReturnType<typeof checkVoiceMatch> | null = null;
          for (const cand of candidates) {
            const res = checkVoiceMatch(card, cand, lang);
            if (res.isMatch) {
              matchResult = res;
              break;
            }
          }

          const primaryRes = matchResult || checkVoiceMatch(card, transcript, lang);
          setSpeechTranscript(primaryRes.heard || transcript);

          // Si coincide, ¡acierto inmediato! No esperamos a que el reconocedor cierre la elocución
          if (matchResult?.isMatch) {
            console.log('[ReviewVoice] Acierto inmediato:', matchResult);
            isCardEvaluated.current = true;
            speechService.abort().catch(() => {});
            setIsListening(false);
            setSpeechStatus('evaluating');
            setFeedback(null);
            setTimeout(() => evaluate(card, true, matchResult.matchedReading), 150);
            return;
          }

          // Solo cuando el reconocedor da por finalizada la frase (isFinal = true) contamos el intento fallido
          if (!isFinal) return;

          console.log('[ReviewVoice] Intento no coincidente:', transcript, '→', primaryRes);
          const used = ++attempts.current.count;
          if (used >= MAX_VOICE_ATTEMPTS) {
            evaluate(card, false);
            return;
          }
          setFeedback(`No coincide · intento ${used} de ${MAX_VOICE_ATTEMPTS}`);
        },
        onError: (err) => {
          if (isStale()) return;
          reportedError = err;
          setIsListening(false);
          setSpeechStatus('idle');
          progressAnim.stopAnimation();
          if (err === MODEL_NOT_DOWNLOADED) {
            setModelRequiredLang(lang);
            return;
          }
          Alert.alert(t('review.micErrorTitle'), err || t('review.micErrorDefault'));
        },
        onEnd: () => {
          if (isStale() || isCardEvaluated.current) return;
          if (attempts.current.count > 0 && attempts.current.count < MAX_VOICE_ATTEMPTS && !store().isChecked) {
            console.log('[ReviewVoice] Reconocedor finalizó intento, reabriendo micrófono limpio para intento restante');
            setTimeout(() => {
              if (!isStale() && !isCardEvaluated.current && !store().isChecked) {
                startListening(card, lang);
              }
            }, 100);
          }
        },
      },
      { contextualStrings: getContextualStrings(card) }
    );

    if (!started && !isStale()) {
      setIsListening(false);
      setSpeechStatus('idle');
      if (!reportedError) Alert.alert(t('review.micNotStartedTitle'), t('review.micNotStartedMsg'));
    }
  };

  /** Botón del micrófono: lo apaga si está escuchando, si no empieza a escuchar. */
  const toggleMic = (card: DueCardWithContext, lang: string) => {
    if (store().speechStatus === 'starting' || setupLabel) return;
    if (store().isListening) {
      speechService.stop();
      setIsListening(false);
      setSpeechStatus('idle');
      progressAnim.stopAnimation();
    } else {
      startListening(card, lang);
    }
  };

  /** Guarda la respuesta, gira la tarjeta al frente y empieza a escuchar la siguiente. */
  async function advance() {
    flushPendingReview();
    cancelAdvance();
    await stopSpeech();
    setSpeechTranscript('');

    isCardEvaluated.current = true;
    speechService.invalidate();
    await speechService.abort().catch(() => {});

    // El contenido cambia a mitad del giro (150 ms), cuando la tarjeta está de perfil
    let advanced = false;
    const doAdvance = () => {
      if (advanced) return;
      advanced = true;
      store().advanceCard();
    };
    setTimeout(doAdvance, 150);

    flip.showFront(300, () => {
      doAdvance();
      const state = store();
      // advanceCard() no mueve el índice en la última tarjeta: no volver a abrir el micrófono
      const next = state.sessionCompleted ? null : state.getCurrentCard();
      // Las tarjetas personalizadas se responden con los botones: abrir el micrófono ahí hacía que el
      // audio del propio mazo (que dice la palabra) se diera por respuesta y pasara tarjetas solo
      if (next && !isCustomReviewCard(next)) {
        // Pausa breve de 120ms para purgar cualquier eco de altavoz o sintetizador antes de abrir el micrófono
        setTimeout(() => {
          startListening(next, getEffectiveCardLanguage(next));
        }, 120);
      } else {
        speechService.abort().catch(() => {});
        setIsListening(false);
        setSpeechStatus('idle');
      }
    });
  }

  /** Al empezar una sesión: micrófono en reposo hasta que el usuario lo active. */
  const resetForSession = () => {
    cancelAdvance();
    setIsListening(false);
    setSpeechStatus('idle');
    progressAnim.setValue(0);
  };

  /** La pantalla pierde el foco: guardar lo pendiente y cortar el micrófono. */
  const pauseOnBlur = () => {
    flushPendingReview();
    stopSpeech();
    cancelAdvance();
    isCardEvaluated.current = true;
    speechService.stop();
    setIsListening(false);
    setSpeechStatus('idle');
  };

  /** La app pasa a segundo plano. */
  const pauseOnBackground = () => {
    flushPendingReview();
    stopSpeech();
    speechService.abort().catch(() => {});
    setIsListening(false);
  };

  /** El usuario sale de la sesión. */
  const endSession = () => {
    flushPendingReview();
    stopSpeech();
    cancelAdvance();
    isCardEvaluated.current = true;
    speechService.invalidate();
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    flip.reset();
    speechService.abort().catch(() => {});
    setSpeechTranscript('');
  };

  return {
    setupLabel,
    feedback,
    progressAnim,
    pulseAnim,
    showModelRequired: modelRequiredLang !== null,
    modelRequiredLang,
    closeModelRequired: () => setModelRequiredLang(null),
    goToModelDownload,
    ensureReady,
    prepareModel,
    toggleMic,
    evaluate,
    markIncorrect,
    advance,
    /** Avisa que terminaron los audios del dorso del mazo (AnkiCardView), para arrancar la cuenta. */
    deckAudioDone: () => deckAudioWaitRef.current?.done(),
    resetForSession,
    pauseOnBlur,
    pauseOnBackground,
    endSession,
  };
}
