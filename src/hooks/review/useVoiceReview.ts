import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing } from 'react-native';
import { Rating } from 'ts-fsrs';
import { speakText, stopSpeech } from '../../../lib/audio-service';
import { getEffectiveCardLanguage } from '../../../lib/japanese-utils';
import { registerWordInDictionary } from '../../../lib/phonetic-dictionary';
import { calculateChineseAccuracyScore } from '../../../lib/pinyin-utils';
import { MODEL_NOT_DOWNLOADED, sherpaVoiceService } from '../../../lib/sherpa-service';
import { speechService, usesOfflineModel } from '../../../lib/speech-recognition-service';
import { checkVoiceMatch, DueCardWithContext } from '../../../lib/srs-engine';
import { CardEvaluation, useReviewStore } from '../../stores/reviewStore';
import type { useAutoAdvance } from './useAutoAdvance';
import type { useCardFlip } from './useCardFlip';

/** Segundos que tiene el usuario para pronunciar cada tarjeta. */
const VOICE_TIMEOUT_SECONDS = 15;
/** Intentos de pronunciación por tarjeta antes de darla por fallada. */
const MAX_VOICE_ATTEMPTS = 3;
/** Tiempo con la respuesta a la vista antes de pasar sola a la siguiente tarjeta. */
const ANSWER_VISIBLE_MS = 7000;

/** Palabras esperadas para sesgar el reconocedor nativo (solo se usa en idiomas sin modelo offline). */
const getContextualStrings = (card: DueCardWithContext): string[] => {
  const strings = [card.displayText, ...(card.displayReading || '').split(/[\/\n,、;•|]/)];
  return Array.from(new Set(strings.map((x) => (x || '').trim()).filter(Boolean)));
};

/**
 * Repaso manos libres: micrófono, intentos, límite de tiempo, evaluación y paso automático
 * a la siguiente tarjeta. Todo el estado de voz de la pantalla de repaso vive acá.
 */
export function useVoiceReview(flip: ReturnType<typeof useCardFlip>, autoAdvance: ReturnType<typeof useAutoAdvance>) {
  const router = useRouter();
  const isListening = useReviewStore((s) => s.isListening);
  const store = useReviewStore.getState;
  const { setIsListening, setSpeechStatus, setSpeechTranscript, setIsChecked, setEvaluation } = useReviewStore.getState();

  // Texto mientras se carga el modelo de voz (null = listo / inactivo)
  const [setupLabel, setSetupLabel] = useState<string | null>(null);
  // Aviso bajo la transcripción ("No coincide · intento 1 de 3")
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showModelRequired, setShowModelRequired] = useState(false);

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
    setShowModelRequired(false);
    router.push({ pathname: '/profile', params: { section: 'audio' } });
  };

  /** Carga en memoria el modelo de voz (ya descargado) para el idioma. */
  const prepareModel = async (lang: string): Promise<boolean> => {
    if (!usesOfflineModel(lang) || sherpaVoiceService.isReady(lang)) return true;
    setSetupLabel('Cargando motor de voz…');
    try {
      const loaded = await sherpaVoiceService.loadModel(lang);
      if (!loaded && sherpaVoiceService.lastError === MODEL_NOT_DOWNLOADED) setShowModelRequired(true);
      else if (!loaded) Alert.alert('Motor de voz', sherpaVoiceService.lastError ?? 'No se pudo cargar el modelo de voz.');
      return loaded;
    } finally {
      setSetupLabel(null);
    }
  };

  /**
   * Antes de empezar una sesión por voz: permiso de micrófono y modelo descargado.
   * Devuelve false (y avisa) si no se puede empezar.
   */
  const ensureReady = async (lang: string, onModelMissing: () => void): Promise<boolean> => {
    const hasPerm = (await speechService.checkPermissions()) || (await speechService.requestPermissions());
    if (!hasPerm) {
      Alert.alert('Permiso de Micrófono', 'Para practicar con voz es necesario permitir el acceso al micrófono desde los Ajustes del dispositivo.');
      return false;
    }
    if (usesOfflineModel(lang) && !(await sherpaVoiceService.isModelDownloaded())) {
      onModelMissing();
      // Esperar a que cierre el modal de opciones antes de abrir el aviso (dos Modal a la vez fallan en Android)
      setTimeout(() => setShowModelRequired(true), 250);
      return false;
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
      speakText(card.displayText, lang, isSuccess && matchedReading ? matchedReading : card.displayReading);
      autoAdvance.start(ANSWER_VISIBLE_MS, advance);
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
    autoAdvance.cancel();
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
        onResult: (transcript, isFinal) => {
          // Cada elocución terminada es UN intento; los resultados parciales solo se muestran
          if (isStale()) return;
          const result = checkVoiceMatch(card, transcript, lang);
          setSpeechTranscript(result.heard || transcript);
          if (!isFinal) return;

          console.log('[ReviewVoice] Intento:', transcript, '→', result);
          if (result.isMatch) {
            isCardEvaluated.current = true;
            speechService.abort().catch(() => {});
            setIsListening(false);
            setSpeechStatus('evaluating');
            setFeedback(null);
            setTimeout(() => evaluate(card, true, result.matchedReading), 150);
            return;
          }

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
            setShowModelRequired(true);
            return;
          }
          Alert.alert('Error de micrófono', err || 'No fue posible iniciar la captura de voz.');
        },
      },
      { contextualStrings: getContextualStrings(card) }
    );

    if (!started && !isStale()) {
      setIsListening(false);
      setSpeechStatus('idle');
      if (!reportedError) Alert.alert('Micrófono no iniciado', 'No se pudo iniciar la grabación. Toca el micrófono para reintentar.');
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
    autoAdvance.cancel();
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
      if (next) {
        startListening(next, getEffectiveCardLanguage(next));
      } else {
        speechService.abort().catch(() => {});
        setIsListening(false);
        setSpeechStatus('idle');
      }
    });
  }

  /** Al empezar una sesión: micrófono en reposo hasta que el usuario lo active. */
  const resetForSession = () => {
    autoAdvance.cancel();
    setIsListening(false);
    setSpeechStatus('idle');
    progressAnim.setValue(0);
  };

  /** La pantalla pierde el foco: guardar lo pendiente y cortar el micrófono. */
  const pauseOnBlur = () => {
    flushPendingReview();
    stopSpeech();
    autoAdvance.cancel();
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
    autoAdvance.cancel();
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
    showModelRequired,
    closeModelRequired: () => setShowModelRequired(false),
    goToModelDownload,
    ensureReady,
    prepareModel,
    toggleMic,
    evaluate,
    markIncorrect,
    advance,
    resetForSession,
    pauseOnBlur,
    pauseOnBackground,
    endSession,
  };
}
