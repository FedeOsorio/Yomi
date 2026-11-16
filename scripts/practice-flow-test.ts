import {
  initialPracticeFlow,
  PRACTICE_ANSWER_MS,
  PracticeEffect,
  PracticeEvent,
  PracticeFlowState,
  stepPracticeFlow,
} from '../lib/practice-flow';

/**
 * Prueba del recorrido de la práctica de conjugaciones (lib/practice-flow.ts) sin teléfono: un simulador con reloj
 * virtual ejecuta los efectos con una voz y una transición falsas que se comportan como las reales, y corre
 * prácticas completas de varias tarjetas.
 *
 *   npm run test:practice
 *
 * Después de cada práctica se comprueba: cada tarjeta se evalúa exactamente una vez, nunca hay dos cuentas a la
 * vez, "Siguiente" repetido no saltea tarjetas, un toque frena la cuenta y la práctica termina.
 */

const FADE_MS = 280;
const SPEECH_MS = 900;

/** Acciones del usuario en una tarjeta, a los `ms` de que aparece */
interface CardScript {
  /** Escribe la respuesta y la envía (dos veces seguidas si `twice`) */
  typesAt: { at: number; correct: boolean; twice?: boolean };
  /** Con la respuesta a la vista: toca la pantalla a los `touchAt` ms y "Siguiente" a los `nextAt` ms */
  touchAt?: number;
  nextAt?: number;
  doubleNext?: boolean;
}
interface Scenario {
  name: string;
  cards: CardScript[];
  expect: ('correct' | 'incorrect')[];
}

interface Outcome {
  evaluated: Map<number, ('correct' | 'incorrect')[]>;
  problems: string[];
  finalPhase: string;
  cardsReached: number;
}

function simulate(sc: Scenario): Outcome {
  let state: PracticeFlowState = initialPracticeFlow;
  let now = 0;
  let seq = 0;
  const queue: { at: number; seq: number; ev: PracticeEvent | (() => void); tag?: string }[] = [];
  const schedule = (delay: number, ev: PracticeEvent | (() => void), tag?: string) => queue.push({ at: now + delay, seq: seq++, ev, tag });
  const cancel = (tag: string) => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].tag === tag) queue.splice(i, 1);
  };

  const out: Outcome = { evaluated: new Map(), problems: [], finalPhase: '', cardsReached: 1 };
  let cardIndex = 0;

  const scheduleCard = () => {
    const card = sc.cards[cardIndex];
    if (!card) return;
    const { at, correct, twice } = card.typesAt;
    schedule(at, { type: 'textSubmitted', correct }, `card-${cardIndex}`);
    if (twice) schedule(at + 5, { type: 'textSubmitted', correct }, `card-${cardIndex}`);
  };

  const run = (effects: PracticeEffect[]) => {
    for (const fx of effects) {
      switch (fx.type) {
        case 'record': {
          const list = out.evaluated.get(cardIndex) ?? [];
          list.push(fx.correct ? 'correct' : 'incorrect');
          out.evaluated.set(cardIndex, list);
          const card = sc.cards[cardIndex];
          if (card?.touchAt !== undefined) schedule(card.touchAt, { type: 'touched' });
          if (card?.nextAt !== undefined) {
            schedule(card.nextAt, { type: 'nextPressed' });
            if (card.doubleNext) schedule(card.nextAt + 5, { type: 'nextPressed' });
          }
          break;
        }
        case 'speak':
          schedule(SPEECH_MS, () => {}, 'speech');
          break;
        case 'stopSpeech':
          cancel('speech');
          break;
        case 'startCountdown':
          if (queue.some((q) => q.tag === 'countdown')) out.problems.push(`t=${now}: dos cuentas a la vez`);
          schedule(PRACTICE_ANSWER_MS, { type: 'countdownDone', turn: fx.turn }, 'countdown');
          break;
        case 'cancelCountdown':
          cancel('countdown');
          break;
        case 'advance': {
          const turn = fx.turn;
          const hasNext = cardIndex + 1 < sc.cards.length;
          schedule(FADE_MS, { type: 'advanced', turn, hasNext });
          break;
        }
        case 'nextCard':
          cancel(`card-${cardIndex}`);
          cardIndex++;
          out.cardsReached = cardIndex + 1;
          scheduleCard();
          break;
        case 'resetCard':
          break;
      }
    }
  };

  const dispatch = (ev: PracticeEvent) => {
    const step = stepPracticeFlow(state, ev);
    state = step.state;
    run(step.effects);
  };

  dispatch({ type: 'cardShown' });
  scheduleCard();

  while (queue.length > 0 && now < 900000) {
    queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const item = queue.shift()!;
    now = item.at;
    if (typeof item.ev === 'function') item.ev();
    else dispatch(item.ev);
  }
  out.finalPhase = state.phase;
  return out;
}

// ─── Escenarios ────────────────────────────────────────────────────────────────────────────────

const right = (at: number, twice = false) => ({ at, correct: true, twice });
const wrong = (at: number) => ({ at, correct: false });

const scenarios: Scenario[] = [
  {
    name: '5 tarjetas: contesta y deja que pase sola',
    cards: Array.from({ length: 5 }, () => ({ typesAt: right(1200) })),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Bien y mal alternadas, con "Siguiente"',
    cards: [{ typesAt: right(900), nextAt: 500 }, { typesAt: wrong(900), nextAt: 500 }, { typesAt: right(900), nextAt: 500 }],
    expect: ['correct', 'incorrect', 'correct'],
  },
  {
    name: 'Toca la pantalla (frena la cuenta) y "Siguiente" con doble toque',
    cards: [{ typesAt: right(2000), touchAt: 1000, nextAt: 9000, doubleNext: true }, { typesAt: wrong(1500), nextAt: 500, doubleNext: true }, { typesAt: right(800) }],
    expect: ['correct', 'incorrect', 'correct'],
  },
  {
    name: 'Envía la respuesta dos veces seguidas: se evalúa una sola vez',
    cards: [{ typesAt: right(900, true) }, { typesAt: right(900, true) }],
    expect: ['correct', 'correct'],
  },
];

// ─── Correr ────────────────────────────────────────────────────────────────────────────────────

let failures = 0;
for (const sc of scenarios) {
  const out = simulate(sc);
  const problems = [...out.problems];
  sc.expect.forEach((want, i) => {
    const got = out.evaluated.get(i) ?? [];
    if (got.length !== 1) problems.push(`tarjeta ${i}: se evaluó ${got.length} veces (${got.join(', ') || 'ninguna'})`);
    else if (got[0] !== want) problems.push(`tarjeta ${i}: ${got[0]}, se esperaba ${want}`);
  });
  if (out.cardsReached !== sc.cards.length) problems.push(`llegó a ${out.cardsReached} de ${sc.cards.length} tarjetas`);
  if (out.finalPhase !== 'finished') problems.push(`terminó en "${out.finalPhase}", no en "finished"`);

  console.log(`${problems.length === 0 ? '✓' : '✗'} ${sc.name}`);
  problems.forEach((p) => console.log(`    ${p}`));
  if (problems.length > 0) failures++;
}

// ─── Reglas sueltas ────────────────────────────────────────────────────────────────────────────

const run = (events: PracticeEvent[], from: PracticeFlowState = initialPracticeFlow) =>
  events.reduce((acc, ev) => {
    const step = stepPracticeFlow(acc.state, ev);
    return { state: step.state, effects: [...acc.effects, ...step.effects] };
  }, { state: from, effects: [] as PracticeEffect[] });

const asking = run([{ type: 'cardShown' }]).state;
const answered = run([{ type: 'textSubmitted', correct: true }], asking).state;

const rules: [string, boolean][] = [
  ['una cuenta de otra tarjeta no pasa de tarjeta', run([{ type: 'countdownDone', turn: 99 }], answered).state.phase === 'answered'],
  ['al acertar se lee la respuesta', run([{ type: 'textSubmitted', correct: true }], asking).effects.some((e) => e.type === 'speak')],
  ['al fallar no se lee la respuesta', !run([{ type: 'textSubmitted', correct: false }], asking).effects.some((e) => e.type === 'speak')],
  ['con la respuesta a la vista, otra respuesta no cuenta', run([{ type: 'textSubmitted', correct: false }], answered).state.result === 'correct'],
  ['un toque frena la cuenta y luego no pasa sola', run([{ type: 'touched' }, { type: 'countdownDone', turn: answered.turn }], answered).state.phase === 'answered'],
  ['"Siguiente" dos veces pasa una sola tarjeta', run([{ type: 'nextPressed' }, { type: 'nextPressed' }], answered).effects.filter((e) => e.type === 'advance').length === 1],
  ['"Siguiente" antes de contestar no hace nada', run([{ type: 'nextPressed' }], asking).state.phase === 'idle'],
  ['cambiar de forma corta la voz y la cuenta', (() => {
    const fx = run([{ type: 'cardShown' }], answered).effects.map((e) => e.type);
    return fx.includes('stopSpeech') && fx.includes('cancelCountdown');
  })()],
  ['al abrir la práctica no se corta ningún audio', !run([{ type: 'cardShown' }]).effects.some((e) => e.type === 'stopSpeech')],
  ['la última tarjeta termina la práctica', (() => {
    const adv = run([{ type: 'nextPressed' }], answered).state;
    return run([{ type: 'advanced', turn: adv.turn, hasNext: false }], adv).state.phase === 'finished';
  })()],
];
for (const [name, ok] of rules) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures++;
}

console.log(failures === 0 ? '\nTodo bien' : `\n${failures} FALLAN`);
process.exitCode = failures === 0 ? 0 : 1;
