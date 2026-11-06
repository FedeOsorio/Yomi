/**
 * Recorrido del repaso por voz, como una sola máquina de estados pura (sin React, sin micrófono, sin
 * animaciones): recibe lo que pasa (eventos) y devuelve el estado nuevo y lo que hay que hacer (efectos).
 * Quien la usa (src/hooks/review/useVoiceReview.ts) ejecuta los efectos y le avisa los resultados.
 *
 *   escuchando ──acierto / 3 fallos / tiempo──▶ girando ──▶ leyendo ──▶ cuenta ──▶ pasando ──▶ (siguiente)
 *       ▲  └─se cerró solo (silencio)─┘                                    └── "Siguiente" ──┘
 *
 * Una sola regla descarta los avisos viejos: cada evento trae el número de tarjeta (`turn`) o de apertura
 * del micrófono (`session`) que lo originó, y si no es el actual se ignora. Así un resultado que llega
 * tarde, un "terminó" repetido o una voz que avisa dos veces no pueden mover la sesión.
 *
 * Se prueba con `npm run test:review` (scripts/review-flow-test.ts).
 */

/** Segundos que tiene el usuario para pronunciar cada tarjeta. */
export const VOICE_TIMEOUT_MS = 15000;
/** Intentos de pronunciación por tarjeta antes de darla por fallada. */
export const MAX_VOICE_ATTEMPTS = 3;
/** Tiempo con la respuesta a la vista antes de pasar sola a la siguiente tarjeta. */
export const ANSWER_VISIBLE_MS = 7000;
/** Si la voz de Yomi no avisa que terminó (algunos motores no lo hacen), se sigue igual. */
export const SPEECH_SAFETY_MS = 5000;

export type VoicePhase =
  /** Micrófono en reposo: espera que el usuario lo active (al empezar, al detenerlo o tras un error) */
  | 'idle'
  /** Abriendo el micrófono */
  | 'starting'
  /** Escuchando */
  | 'listening'
  /** Evaluada: girando al dorso */
  | 'revealing'
  /** Leyendo la palabra con la voz de Yomi */
  | 'speaking'
  /** Respuesta a la vista: cuenta regresiva para pasar sola */
  | 'countdown'
  /** Respuesta a la vista sin cuenta (se salió de la pantalla con la respuesta abierta) */
  | 'answered'
  /** Girando al frente para pasar a la siguiente */
  | 'advancing';

export interface VoiceFlowState {
  phase: VoicePhase;
  /** Tarjeta actual: sube al pasar de tarjeta */
  turn: number;
  /** Apertura del micrófono: sube cada vez que se abre */
  session: number;
  /** Intentos fallidos en la tarjeta actual */
  attempts: number;
  /** El tiempo de la tarjeta está corriendo (sigue corriendo aunque el micrófono se cierre y se reabra) */
  timerStarted: boolean;
  /** Resultado de la tarjeta (null mientras no se evaluó) */
  result: 'correct' | 'incorrect' | null;
  /** Lectura que dijo el usuario, si acertó (se lee esa) */
  matchedReading?: string;
  /** Se salió de la pantalla mientras giraba al frente: la siguiente no abre el micrófono sola */
  holdMic: boolean;
}

/** Cómo se ve el micrófono: en reposo, abriéndose, escuchando, o el resultado con la respuesta a la vista. */
export type MicStatus = 'idle' | 'starting' | 'listening' | 'correct' | 'incorrect';

export function micStatusOf(state: VoiceFlowState): MicStatus {
  if (state.phase === 'idle' || state.phase === 'starting' || state.phase === 'listening') return state.phase;
  return state.result === 'correct' ? 'correct' : 'incorrect';
}

/** Qué viene después de pasar de tarjeta: otra por voz, una de botones (personalizada) o el fin. */
export type NextCard = 'voice' | 'buttons' | 'end';

export type VoiceEvent =
  /** Hay una tarjeta nueva en pantalla que no llegó pasando por voz (inicio de sesión, botones) */
  | { type: 'cardShown' }
  /** Botón del micrófono */
  | { type: 'micPressed' }
  | { type: 'micStarted'; session: number }
  | { type: 'micNotStarted'; session: number }
  /** El reconocedor entendió algo (`match` lo decide voice-match antes de avisar) */
  | { type: 'heard'; session: number; match: boolean; final: boolean; reading?: string }
  /** Error real del reconocedor (el silencio no es un error) */
  | { type: 'micError'; session: number }
  /** El reconocedor se cerró solo (silencio, fin de frase) */
  | { type: 'micClosed'; session: number }
  | { type: 'timeUp'; turn: number }
  /** "No lo sé" */
  | { type: 'giveUp' }
  | { type: 'flipDone'; turn: number }
  | { type: 'speechDone'; turn: number }
  | { type: 'countdownDone'; turn: number }
  /** "Siguiente" */
  | { type: 'nextPressed' }
  | { type: 'markIncorrect' }
  /** La pantalla perdió el foco, la app pasó a segundo plano o se salió de la sesión */
  | { type: 'interrupted' }
  /** Terminó el giro al frente y la tarjeta siguiente ya está en pantalla */
  | { type: 'advanced'; turn: number; next: NextCard };

export type VoiceEffect =
  | { type: 'openMic'; session: number }
  | { type: 'closeMic' }
  /** Arranca el tiempo de la tarjeta (avisa `timeUp`). Al reabrirse el micrófono no se toca: sigue corriendo */
  | { type: 'startTimer'; turn: number }
  | { type: 'stopTimer' }
  /** Mostrar "No coincide · intento N de 3" */
  | { type: 'feedback'; attempt: number }
  /** Registrar el resultado y girar al dorso (avisa `flipDone` al terminar) */
  | { type: 'reveal'; turn: number; correct: boolean; reading?: string }
  | { type: 'speak'; turn: number; reading?: string }
  | { type: 'stopSpeech' }
  | { type: 'startCountdown'; turn: number }
  | { type: 'cancelCountdown' }
  | { type: 'markIncorrect' }
  /** Guardar en el SRS la respuesta pendiente */
  | { type: 'saveAnswer' }
  /** Girar al frente y pasar de tarjeta (avisa `advanced`) */
  | { type: 'advance'; turn: number }
  /** Tarjeta nueva: limpiar lo que se oyó y el aviso de intentos */
  | { type: 'resetCard' };

export const initialVoiceFlow: VoiceFlowState = {
  phase: 'idle',
  turn: 0,
  session: 0,
  attempts: 0,
  timerStarted: false,
  result: null,
  holdMic: false,
};

type Step = { state: VoiceFlowState; effects: VoiceEffect[] };

const isAsking = (phase: VoicePhase) => phase === 'idle' || phase === 'starting' || phase === 'listening';
const isMicOpen = (phase: VoicePhase) => phase === 'starting' || phase === 'listening';
const showsAnswer = (phase: VoicePhase) =>
  phase === 'revealing' || phase === 'speaking' || phase === 'countdown' || phase === 'answered';

/** Tarjeta nueva (sin respuesta, sin intentos). */
function freshCard(state: VoiceFlowState): VoiceFlowState {
  return { ...state, turn: state.turn + 1, attempts: 0, timerStarted: false, result: null, matchedReading: undefined, holdMic: false };
}

/** Abre el micrófono en una apertura nueva. */
function openMic(state: VoiceFlowState, phase: VoicePhase): Step {
  const session = state.session + 1;
  return { state: { ...state, phase, session }, effects: [{ type: 'openMic', session }] };
}

/** Evalúa la tarjeta: cierra el micrófono, registra el resultado y gira al dorso. */
function reveal(state: VoiceFlowState, correct: boolean, reading?: string): Step {
  return {
    state: { ...state, phase: 'revealing', result: correct ? 'correct' : 'incorrect', matchedReading: correct ? reading : undefined },
    effects: [
      ...(isMicOpen(state.phase) ? [{ type: 'closeMic' } as const] : []),
      { type: 'stopTimer' },
      { type: 'reveal', turn: state.turn, correct, reading: correct ? reading : undefined },
    ],
  };
}

/** Pasa a la siguiente tarjeta: guarda la respuesta, corta voz y cuenta, y gira al frente. */
function advance(state: VoiceFlowState): Step {
  return {
    state: { ...state, phase: 'advancing' },
    effects: [{ type: 'saveAnswer' }, { type: 'cancelCountdown' }, { type: 'stopSpeech' }, { type: 'advance', turn: state.turn }],
  };
}

const stay = (state: VoiceFlowState): Step => ({ state, effects: [] });

/** Estado siguiente y efectos para un evento. Pura: mismo estado y evento → mismo resultado. */
export function stepVoiceFlow(state: VoiceFlowState, event: VoiceEvent): Step {
  // Avisos de otra apertura del micrófono o de otra tarjeta: se descartan
  if ('session' in event && event.session !== state.session) return stay(state);
  if ('turn' in event && event.turn !== state.turn) return stay(state);

  switch (event.type) {
    case 'cardShown': {
      const effects: VoiceEffect[] = [{ type: 'resetCard' }];
      if (isMicOpen(state.phase)) effects.push({ type: 'closeMic' }, { type: 'stopTimer' });
      if (showsAnswer(state.phase)) effects.push({ type: 'stopSpeech' }, { type: 'cancelCountdown' });
      return { state: { ...freshCard(state), phase: 'idle' }, effects };
    }

    case 'micPressed': {
      if (state.phase === 'idle') {
        // Volver a abrirlo a mano reinicia el tiempo de la tarjeta (los intentos se conservan)
        const step = openMic({ ...state, timerStarted: false }, 'starting');
        return { state: step.state, effects: [{ type: 'stopTimer' }, ...step.effects] };
      }
      if (state.phase === 'listening') {
        return { state: { ...state, phase: 'idle', timerStarted: false }, effects: [{ type: 'closeMic' }, { type: 'stopTimer' }] };
      }
      return stay(state); // abriéndose, o con la respuesta a la vista
    }

    case 'micStarted': {
      if (!isMicOpen(state.phase)) return stay(state);
      // El tiempo arranca la primera vez que el micrófono escucha; al reabrirse, ya está corriendo
      const effects: VoiceEffect[] = state.timerStarted ? [] : [{ type: 'startTimer', turn: state.turn }];
      return { state: { ...state, phase: 'listening', timerStarted: true }, effects };
    }

    case 'micNotStarted':
    case 'micError': {
      if (!isMicOpen(state.phase)) return stay(state);
      // Error real (ya avisado al usuario): queda en reposo, así no se reabre solo
      return { state: { ...state, phase: 'idle', timerStarted: false }, effects: [{ type: 'closeMic' }, { type: 'stopTimer' }] };
    }

    case 'heard': {
      if (!isMicOpen(state.phase)) return stay(state);
      if (event.match) return reveal(state, true, event.reading);
      if (!event.final) return stay(state);
      const attempts = state.attempts + 1;
      if (attempts >= MAX_VOICE_ATTEMPTS) return reveal({ ...state, attempts }, false);
      return { state: { ...state, attempts }, effects: [{ type: 'feedback', attempt: attempts }] };
    }

    case 'micClosed': {
      // Se cerró solo con tiempo e intentos por delante: se reabre una vez, sin reiniciar el tiempo
      if (!isMicOpen(state.phase)) return stay(state);
      return openMic(state, 'listening');
    }

    case 'timeUp':
      return isMicOpen(state.phase) ? reveal(state, false) : stay(state);

    case 'giveUp':
      return isAsking(state.phase) ? reveal(state, false) : stay(state);

    case 'flipDone':
      if (state.phase !== 'revealing') return stay(state);
      return { state: { ...state, phase: 'speaking' }, effects: [{ type: 'speak', turn: state.turn, reading: state.matchedReading }] };

    case 'speechDone':
      if (state.phase !== 'speaking') return stay(state);
      return { state: { ...state, phase: 'countdown' }, effects: [{ type: 'startCountdown', turn: state.turn }] };

    case 'countdownDone':
      return state.phase === 'countdown' ? advance(state) : stay(state);

    case 'nextPressed':
      return showsAnswer(state.phase) ? advance(state) : stay(state);

    case 'markIncorrect':
      if (!showsAnswer(state.phase) || state.result !== 'correct') return stay(state);
      return { state: { ...state, result: 'incorrect', matchedReading: undefined }, effects: [{ type: 'markIncorrect' }] };

    case 'interrupted': {
      if (isMicOpen(state.phase)) {
        return { state: { ...state, phase: 'idle', timerStarted: false }, effects: [{ type: 'closeMic' }, { type: 'stopTimer' }] };
      }
      if (state.phase === 'speaking' || state.phase === 'countdown' || state.phase === 'revealing') {
        // La respuesta queda a la vista, sin pasar sola; "Siguiente" sigue funcionando
        return { state: { ...state, phase: 'answered' }, effects: [{ type: 'saveAnswer' }, { type: 'stopSpeech' }, { type: 'cancelCountdown' }] };
      }
      if (state.phase === 'advancing') return stay({ ...state, holdMic: true });
      return stay(state);
    }

    case 'advanced': {
      if (state.phase !== 'advancing') return stay(state);
      const next = freshCard(state);
      const effects: VoiceEffect[] = [{ type: 'resetCard' }];
      if (event.next !== 'voice' || state.holdMic) return { state: { ...next, phase: 'idle' }, effects };
      // La siguiente se pregunta por voz: el micrófono se abre solo
      const step = openMic(next, 'starting');
      return { state: step.state, effects: [...effects, ...step.effects] };
    }
  }
}
