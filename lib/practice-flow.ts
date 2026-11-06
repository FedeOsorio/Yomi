/**
 * Recorrido de la práctica de conjugaciones, como una máquina de estados pura (sin React, sin micrófono, sin
 * animaciones): recibe lo que pasa (eventos) y devuelve el estado nuevo y lo que hay que hacer (efectos).
 * Quien la usa (src/components/ConjugationPracticeModal.tsx) ejecuta los efectos y le avisa los resultados.
 *
 *   en reposo ──micrófono──▶ escuchando ──frase final / texto──▶ respondida ──7 s / "Siguiente"──▶ pasando ──▶ (siguiente)
 *                               └─ se cerró solo: en modo automático se reabre ─┘
 *
 * Igual que el repaso (lib/review-flow.ts), una sola regla descarta los avisos viejos: cada evento trae el número
 * de tarjeta (`turn`) o de apertura del micrófono (`session`) que lo originó, y si no es el actual se ignora.
 *
 * Modo automático (mantener apretado el micrófono): el micrófono se reabre solo al cerrarse por silencio y al
 * pasar de tarjeta. Se apaga con un toque, con un error del reconocedor (no se reintenta en bucle) o tras
 * MAX_SILENT_REOPENS cierres seguidos sin oír nada.
 *
 * Se prueba con `npm run test:practice` (scripts/practice-flow-test.ts).
 */

/** Tiempo con la respuesta a la vista antes de pasar sola a la siguiente tarjeta. */
export const PRACTICE_ANSWER_MS = 7000;
/** En modo automático, cierres seguidos por silencio (sin oír nada) antes de apagarse solo. */
export const MAX_SILENT_REOPENS = 8;

export type PracticePhase =
  /** Esperando la respuesta, micrófono en reposo */
  | 'idle'
  /** Abriendo el micrófono */
  | 'starting'
  /** Escuchando */
  | 'listening'
  /** Respuesta evaluada a la vista */
  | 'answered'
  /** Pasando a la siguiente tarjeta */
  | 'advancing'
  /** No hay más tarjetas */
  | 'finished';

export interface PracticeFlowState {
  phase: PracticePhase;
  /** Tarjeta actual: sube al pasar de tarjeta */
  turn: number;
  /** Apertura del micrófono: sube cada vez que se abre */
  session: number;
  /** Modo automático: el micrófono se abre solo en cada tarjeta */
  auto: boolean;
  /** Cierres seguidos por silencio en modo automático */
  silentReopens: number;
  /** Corre la cuenta para pasar sola (un toque en la pantalla la detiene) */
  countdown: boolean;
  /** Resultado de la tarjeta (null mientras no se respondió) */
  result: 'correct' | 'incorrect' | null;
}

export type PracticeEvent =
  /** Tarjetas nuevas en pantalla (carga, cambio de forma, cerrar la práctica): todo vuelve a reposo */
  | { type: 'cardShown' }
  /** Toque en el micrófono: lo abre, o lo apaga (y el modo automático) */
  | { type: 'micPressed' }
  /** Se mantuvo apretado el micrófono: modo automático */
  | { type: 'holdCompleted' }
  | { type: 'micStarted'; session: number }
  | { type: 'micNotStarted'; session: number }
  /** El reconocedor entendió algo (`match` se decide antes de avisar) */
  | { type: 'heard'; session: number; match: boolean; final: boolean }
  /** Error real del reconocedor (el silencio no es un error) */
  | { type: 'micError'; session: number }
  /** El reconocedor se cerró solo (silencio, fin de frase) */
  | { type: 'micClosed'; session: number }
  /** Respuesta escrita (`correct` se decide antes de avisar) */
  | { type: 'textSubmitted'; correct: boolean }
  /** Toque en cualquier parte de la pantalla */
  | { type: 'touched' }
  | { type: 'countdownDone'; turn: number }
  /** "Siguiente" (también "Dominada", que además quita la forma de la cola) */
  | { type: 'nextPressed' }
  /** Terminó de desvanecerse la tarjeta (`hasNext`: hay otra en la cola) */
  | { type: 'advanced'; turn: number; hasNext: boolean };

export type PracticeEffect =
  | { type: 'openMic'; session: number }
  | { type: 'closeMic' }
  /** Registrar el resultado (puntaje, racha) y mostrarlo */
  | { type: 'record'; correct: boolean }
  /** Leer la forma correcta (solo al acertar, después de cerrar el micrófono) */
  | { type: 'speak' }
  | { type: 'stopSpeech' }
  /** Barra de 7 s (avisa `countdownDone`) */
  | { type: 'startCountdown'; turn: number }
  | { type: 'cancelCountdown' }
  /** Desvanecer la tarjeta actual (avisa `advanced` al terminar, diciendo si hay otra) */
  | { type: 'advance'; turn: number }
  /** Mostrar la siguiente tarjeta (aparece desvaneciéndose) */
  | { type: 'nextCard' }
  /** Tarjeta nueva: limpiar lo escrito, lo oído y la respuesta */
  | { type: 'resetCard' };

export const initialPracticeFlow: PracticeFlowState = {
  phase: 'idle',
  turn: 0,
  session: 0,
  auto: false,
  silentReopens: 0,
  countdown: false,
  result: null,
};

type Step = { state: PracticeFlowState; effects: PracticeEffect[] };

const isMicOpen = (phase: PracticePhase) => phase === 'starting' || phase === 'listening';
const isAsking = (phase: PracticePhase) => phase === 'idle' || isMicOpen(phase);

/** El micrófono se ve encendido: escuchando, abriéndose o en modo automático esperando la próxima tarjeta. */
export function micLooksOn(state: PracticeFlowState): boolean {
  return isMicOpen(state.phase) || (state.auto && state.phase !== 'finished');
}

const stay = (state: PracticeFlowState): Step => ({ state, effects: [] });

function openMic(state: PracticeFlowState, phase: PracticePhase): Step {
  const session = state.session + 1;
  return { state: { ...state, phase, session }, effects: [{ type: 'openMic', session }] };
}

/** Micrófono a reposo y modo automático apagado (con la respuesta a la vista, solo se apaga el automático). */
function micOff(state: PracticeFlowState): Step {
  const open = isMicOpen(state.phase);
  return {
    state: { ...state, phase: open ? 'idle' : state.phase, auto: false, silentReopens: 0 },
    effects: open ? [{ type: 'closeMic' }] : [],
  };
}

/** Respuesta evaluada: cierra el micrófono, registra, lee la forma si acertó y arranca la cuenta. */
function answer(state: PracticeFlowState, correct: boolean): Step {
  return {
    state: { ...state, phase: 'answered', result: correct ? 'correct' : 'incorrect', countdown: true, silentReopens: 0 },
    effects: [
      ...(isMicOpen(state.phase) ? [{ type: 'closeMic' } as const] : []),
      { type: 'record', correct },
      ...(correct ? [{ type: 'speak' } as const] : []),
      { type: 'startCountdown', turn: state.turn },
    ],
  };
}

function advance(state: PracticeFlowState): Step {
  return {
    state: { ...state, phase: 'advancing', countdown: false },
    effects: [{ type: 'cancelCountdown' }, { type: 'stopSpeech' }, { type: 'advance', turn: state.turn }],
  };
}

/** Estado siguiente y efectos para un evento. Pura: mismo estado y evento → mismo resultado. */
export function stepPracticeFlow(state: PracticeFlowState, event: PracticeEvent): Step {
  // Avisos de otra apertura del micrófono o de otra tarjeta: se descartan
  if ('session' in event && event.session !== state.session) return stay(state);
  if ('turn' in event && event.turn !== state.turn) return stay(state);

  switch (event.type) {
    case 'cardShown': {
      const effects: PracticeEffect[] = [];
      if (isMicOpen(state.phase)) effects.push({ type: 'closeMic' });
      // La voz de Yomi solo habla con una respuesta a la vista: si no, no hay nada que cortar (ni audio ajeno)
      if (state.result !== null) effects.push({ type: 'cancelCountdown' }, { type: 'stopSpeech' });
      effects.push({ type: 'resetCard' });
      return {
        state: { ...state, phase: 'idle', turn: state.turn + 1, auto: false, silentReopens: 0, countdown: false, result: null },
        effects,
      };
    }

    case 'micPressed':
      if (state.phase === 'idle' && !state.auto) return openMic(state, 'starting');
      if (isMicOpen(state.phase) || state.auto) return micOff(state);
      return stay(state);

    case 'holdCompleted':
      if (!isAsking(state.phase) || state.auto) return stay(state);
      if (state.phase === 'idle') return openMic({ ...state, auto: true, silentReopens: 0 }, 'starting');
      return stay({ ...state, auto: true, silentReopens: 0 }); // ya escuchaba: sigue igual, ahora en automático

    case 'micStarted':
      return state.phase === 'starting' ? stay({ ...state, phase: 'listening' }) : stay(state);

    case 'micNotStarted':
    case 'micError':
      // Error real (ya avisado): queda en reposo y se apaga el automático, así no se reabre en bucle
      return isMicOpen(state.phase) ? micOff(state) : stay(state);

    case 'heard':
      if (!isMicOpen(state.phase)) return stay(state);
      if (event.match || event.final) return answer(state, event.match);
      return stay({ ...state, silentReopens: 0 });

    case 'micClosed': {
      if (!isMicOpen(state.phase)) return stay(state);
      if (!state.auto) return { state: { ...state, phase: 'idle' }, effects: [] };
      // Automático: se reabre (una vez por cierre). Si se cierra muchas veces sin oír nada, se apaga
      const silentReopens = state.silentReopens + 1;
      if (silentReopens > MAX_SILENT_REOPENS) return { state: { ...state, phase: 'idle', auto: false, silentReopens: 0 }, effects: [] };
      return openMic({ ...state, silentReopens }, 'listening');
    }

    case 'textSubmitted':
      return isAsking(state.phase) ? answer(state, event.correct) : stay(state);

    case 'touched':
      if (state.phase !== 'answered' || !state.countdown) return stay(state);
      return { state: { ...state, countdown: false }, effects: [{ type: 'cancelCountdown' }] };

    case 'countdownDone':
      return state.phase === 'answered' && state.countdown ? advance(state) : stay(state);

    case 'nextPressed':
      return state.phase === 'answered' ? advance(state) : stay(state);

    case 'advanced': {
      if (state.phase !== 'advancing') return stay(state);
      const next: PracticeFlowState = { ...state, turn: state.turn + 1, result: null, countdown: false, silentReopens: 0 };
      if (!event.hasNext) return { state: { ...next, phase: 'finished', auto: false }, effects: [{ type: 'resetCard' }] };
      // La tarjeta nueva entra ya con el micrófono abriéndose (en automático)
      const effects: PracticeEffect[] = [{ type: 'resetCard' }, { type: 'nextCard' }];
      if (!state.auto) return { state: { ...next, phase: 'idle' }, effects };
      const step = openMic(next, 'starting');
      return { state: step.state, effects: [...effects, ...step.effects] };
    }
  }
}
