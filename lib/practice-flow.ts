/**
 * Recorrido de la práctica de conjugaciones, como una máquina de estados pura (sin React ni animaciones):
 * recibe lo que pasa (eventos) y devuelve el estado nuevo y lo que hay que hacer (efectos).
 * Quien la usa (src/components/ConjugationPracticeModal.tsx) ejecuta los efectos y le avisa los resultados.
 *
 *   esperando ──respuesta escrita──▶ respondida ──7 s / "Siguiente"──▶ pasando ──▶ (siguiente tarjeta)
 *
 * Una sola regla descarta los avisos viejos: los que vienen de una tarjeta traen su número (`turn`) y, si no es
 * la tarjeta actual, se ignoran.
 *
 * Se prueba con `npm run test:practice` (scripts/practice-flow-test.ts).
 */

/** Tiempo con la respuesta a la vista antes de pasar sola a la siguiente tarjeta. */
export const PRACTICE_ANSWER_MS = 7000;

export type PracticePhase =
  /** Esperando la respuesta */
  | 'idle'
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
  /** Corre la cuenta para pasar sola (un toque en la pantalla la detiene) */
  countdown: boolean;
  /** Resultado de la tarjeta (null mientras no se respondió) */
  result: 'correct' | 'incorrect' | null;
}

export type PracticeEvent =
  /** Tarjetas nuevas en pantalla (carga, cambio de forma, cerrar la práctica): todo vuelve a esperar */
  | { type: 'cardShown' }
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
  /** Registrar el resultado (puntaje, racha) y mostrarlo */
  | { type: 'record'; correct: boolean }
  /** Leer la forma correcta (solo al acertar) */
  | { type: 'speak' }
  | { type: 'stopSpeech' }
  /** Barra de 7 s (avisa `countdownDone`) */
  | { type: 'startCountdown'; turn: number }
  | { type: 'cancelCountdown' }
  /** Desvanecer la tarjeta actual (avisa `advanced` al terminar, diciendo si hay otra) */
  | { type: 'advance'; turn: number }
  /** Mostrar la siguiente tarjeta (aparece desvaneciéndose) */
  | { type: 'nextCard' }
  /** Tarjeta nueva: limpiar lo escrito y la respuesta */
  | { type: 'resetCard' };

export const initialPracticeFlow: PracticeFlowState = {
  phase: 'idle',
  turn: 0,
  countdown: false,
  result: null,
};

type Step = { state: PracticeFlowState; effects: PracticeEffect[] };

const stay = (state: PracticeFlowState): Step => ({ state, effects: [] });

function advance(state: PracticeFlowState): Step {
  return {
    state: { ...state, phase: 'advancing', countdown: false },
    effects: [{ type: 'cancelCountdown' }, { type: 'stopSpeech' }, { type: 'advance', turn: state.turn }],
  };
}

/** Estado siguiente y efectos para un evento. Pura: mismo estado y evento → mismo resultado. */
export function stepPracticeFlow(state: PracticeFlowState, event: PracticeEvent): Step {
  // Avisos de otra tarjeta: se descartan
  if ('turn' in event && event.turn !== state.turn) return stay(state);

  switch (event.type) {
    case 'cardShown': {
      // La voz de Yomi solo habla con una respuesta a la vista: si no, no hay nada que cortar (ni audio ajeno)
      const effects: PracticeEffect[] =
        state.result !== null ? [{ type: 'cancelCountdown' }, { type: 'stopSpeech' }, { type: 'resetCard' }] : [{ type: 'resetCard' }];
      return { state: { phase: 'idle', turn: state.turn + 1, countdown: false, result: null }, effects };
    }

    case 'textSubmitted': {
      if (state.phase !== 'idle') return stay(state);
      const { correct } = event;
      return {
        state: { ...state, phase: 'answered', result: correct ? 'correct' : 'incorrect', countdown: true },
        effects: [
          { type: 'record', correct },
          ...(correct ? [{ type: 'speak' } as const] : []),
          { type: 'startCountdown', turn: state.turn },
        ],
      };
    }

    case 'touched':
      if (state.phase !== 'answered' || !state.countdown) return stay(state);
      return { state: { ...state, countdown: false }, effects: [{ type: 'cancelCountdown' }] };

    case 'countdownDone':
      return state.phase === 'answered' && state.countdown ? advance(state) : stay(state);

    case 'nextPressed':
      return state.phase === 'answered' ? advance(state) : stay(state);

    case 'advanced': {
      if (state.phase !== 'advancing') return stay(state);
      const next: PracticeFlowState = { phase: 'idle', turn: state.turn + 1, result: null, countdown: false };
      if (!event.hasNext) return { state: { ...next, phase: 'finished' }, effects: [{ type: 'resetCard' }] };
      return { state: next, effects: [{ type: 'resetCard' }, { type: 'nextCard' }] };
    }
  }
}
