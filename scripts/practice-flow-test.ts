import {
  initialPracticeFlow,
  MAX_SILENT_REOPENS,
  micLooksOn,
  PRACTICE_ANSWER_MS,
  PracticeEffect,
  PracticeEvent,
  PracticeFlowState,
  stepPracticeFlow,
} from '../lib/practice-flow';

/**
 * Prueba del recorrido de la práctica de conjugaciones (lib/practice-flow.ts) sin teléfono: un simulador con reloj
 * virtual ejecuta los efectos con un micrófono, una voz y una transición falsas que se comportan como las reales, y
 * corre prácticas completas de varias tarjetas.
 *
 *   npm run test:practice
 *
 * - 'native' (el reconocedor del teléfono): se cierra solo tras ~4 s de silencio o después de cada frase final.
 * - 'sherpa': escucha de corrido; solo se cierra cuando se lo pide la app.
 *
 * Después de cada práctica se comprueba: cada tarjeta se evalúa exactamente una vez (o ninguna, si así lo pide el
 * escenario), nunca hay dos micrófonos abiertos, el micrófono nunca queda abierto con la respuesta a la vista, la voz
 * de Yomi nunca habla con el micrófono abierto, el micrófono no se reabre en bucle y la práctica termina.
 */

const NATIVE_SILENCE_MS = 4000;
const MIC_START_MS = 60;
const FADE_MS = 280;
const SPEECH_MS = 900;

type Engine = 'native' | 'sherpa';
/** Acciones del usuario en una tarjeta, a los `ms` de que aparece */
interface CardScript {
  /** Dice algo (correcto o no) */
  says?: { at: number; correct: boolean }[];
  /** Toca el micrófono */
  tapsAt?: number[];
  /** Mantiene apretado el micrófono (modo automático) */
  holdAt?: number;
  /** Escribe la respuesta y la envía */
  typesAt?: { at: number; correct: boolean };
  /** El reconocedor falla (error real) */
  errorAt?: number;
  /** Con la respuesta a la vista: toca la pantalla a los `touchAt` ms y "Siguiente" a los `nextAt` ms */
  touchAt?: number;
  nextAt?: number;
  doubleNext?: boolean;
}
interface Scenario {
  name: string;
  engine: Engine;
  cards: CardScript[];
  /** El reconocedor repite "terminó" y entrega un resultado tarde, después de cerrarlo */
  noisyEngine?: boolean;
  /** Resultado esperado por tarjeta ('none' = el usuario no contesta nunca) */
  expect: ('correct' | 'incorrect' | 'none')[];
  /** Al terminar, ¿el modo automático debe estar apagado? */
  autoOffAt?: number;
}

interface Outcome {
  evaluated: Map<number, ('correct' | 'incorrect')[]>;
  problems: string[];
  finalPhase: string;
  cardsReached: number;
  opens: number;
  autoOffSeen: Set<number>;
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

  const out: Outcome = { evaluated: new Map(), problems: [], finalPhase: '', cardsReached: 1, opens: 0, autoOffSeen: new Set() };
  let cardIndex = 0;
  let openSession: number | null = null;
  let micOpenedAt = 0;
  let speaking = false;

  const closeByEngine = (session: number, delay: number) => {
    schedule(delay, () => {
      if (openSession !== session) return;
      openSession = null;
      dispatch({ type: 'micClosed', session });
      if (sc.noisyEngine) dispatch({ type: 'micClosed', session });
    });
  };

  const userSays = (correct: boolean) => {
    if (openSession === null || state.phase !== 'listening') return;
    const session = openSession;
    dispatch({ type: 'heard', session, match: false, final: false }); // parcial
    dispatch({ type: 'heard', session, match: correct, final: true });
    if (sc.engine === 'native') closeByEngine(session, 30);
  };

  const scheduleCard = () => {
    const card = sc.cards[cardIndex];
    if (!card) return;
    const tag = `card-${cardIndex}`;
    for (const s of card.says ?? []) schedule(s.at, () => userSays(s.correct), tag);
    for (const at of card.tapsAt ?? []) schedule(at, { type: 'micPressed' }, tag);
    if (card.holdAt !== undefined) schedule(card.holdAt, { type: 'holdCompleted' }, tag);
    if (card.typesAt) {
      const { correct } = card.typesAt;
      schedule(card.typesAt.at, { type: 'textSubmitted', correct }, tag);
    }
    if (card.errorAt !== undefined) {
      schedule(card.errorAt, () => {
        if (openSession === null) return;
        const session = openSession;
        dispatch({ type: 'micError', session });
        closeByEngine(session, 20); // el del teléfono manda "terminó" después del error
      }, tag);
    }
  };

  const run = (effects: PracticeEffect[]) => {
    for (const fx of effects) {
      switch (fx.type) {
        case 'openMic':
          out.opens++;
          if (state.phase !== 'starting' && state.phase !== 'listening') out.problems.push(`t=${now}: se abrió el micrófono en "${state.phase}"`);
          if (openSession !== null) out.problems.push(`t=${now}: se abrió el micrófono ${fx.session} con el ${openSession} todavía abierto`);
          if (speaking) out.problems.push(`t=${now}: se abrió el micrófono con la voz de Yomi hablando`);
          openSession = fx.session;
          micOpenedAt = now;
          schedule(MIC_START_MS, { type: 'micStarted', session: fx.session });
          if (sc.engine === 'native') {
            const session = fx.session;
            schedule(MIC_START_MS + NATIVE_SILENCE_MS, () => {
              if (openSession === session) closeByEngine(session, 0);
            }, `silence-${session}`);
          }
          break;
        case 'closeMic':
          if (openSession !== null) {
            cancel(`silence-${openSession}`);
            if (sc.noisyEngine) schedule(20, { type: 'heard', session: openSession, match: true, final: true });
          }
          openSession = null;
          break;
        case 'record': {
          const list = out.evaluated.get(cardIndex) ?? [];
          list.push(fx.correct ? 'correct' : 'incorrect');
          out.evaluated.set(cardIndex, list);
          if (openSession !== null) out.problems.push(`t=${now}: tarjeta ${cardIndex} evaluada con el micrófono abierto`);
          const card = sc.cards[cardIndex];
          if (card?.touchAt !== undefined) schedule(card.touchAt, { type: 'touched' });
          if (card?.nextAt !== undefined) {
            schedule(card.nextAt, { type: 'nextPressed' });
            if (card.doubleNext) schedule(card.nextAt + 5, { type: 'nextPressed' });
          }
          break;
        }
        case 'speak':
          if (openSession !== null) out.problems.push(`t=${now}: la voz de Yomi habla con el micrófono abierto`);
          speaking = true;
          schedule(SPEECH_MS, () => (speaking = false), 'speech');
          break;
        case 'stopSpeech':
          speaking = false;
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
    const wasAuto = state.auto;
    const step = stepPracticeFlow(state, ev);
    state = step.state;
    run(step.effects);
    if (wasAuto && !state.auto) out.autoOffSeen.add(cardIndex);
    if (openSession !== null && (state.phase === 'answered' || state.phase === 'advancing' || state.phase === 'finished')) {
      out.problems.push(`t=${now}: micrófono abierto en "${state.phase}"`);
    }
    if (openSession === null && (state.phase === 'starting' || state.phase === 'listening') && now - micOpenedAt > 1000) {
      // Escuchando con el micrófono cerrado: solo puede pasar un instante entre un cierre y su aviso
      out.problems.push(`t=${now}: se ve escuchando con el micrófono cerrado`);
    }
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
  if (openSession !== null) out.problems.push('terminó con el micrófono abierto');
  return out;
}

// ─── Escenarios ────────────────────────────────────────────────────────────────────────────────

const right = (at: number) => ({ at, correct: true });
const wrong = (at: number) => ({ at, correct: false });
/** Primera tarjeta en modo automático (mantiene apretado el micrófono) y las demás solo hablando */
const autoCards = (n: number, says: { at: number; correct: boolean }[]): CardScript[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? { holdAt: 300, says: says.map((s) => ({ ...s, at: s.at + 300 })) } : { says }));

const scenarios: Scenario[] = [
  {
    name: 'Teléfono, a mano: toca el micrófono en cada tarjeta y contesta',
    engine: 'native',
    cards: Array.from({ length: 4 }, () => ({ tapsAt: [300], says: [right(1200)] })),
    expect: ['correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono, a mano: se cierra por silencio, lo vuelve a tocar y contesta',
    engine: 'native',
    cards: [{ tapsAt: [300, 6000], says: [right(7000)] }, { tapsAt: [300], says: [wrong(900)] }],
    expect: ['correct', 'incorrect'],
  },
  {
    name: 'Teléfono, automático: 5 tarjetas contestando enseguida',
    engine: 'native',
    cards: autoCards(5, [right(900)]),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono, automático: lee 9 s en silencio antes de contestar (se reabre solo)',
    engine: 'native',
    cards: autoCards(4, [right(9000)]),
    expect: ['correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono, automático: avisos de cierre repetidos y resultados tardíos',
    engine: 'native',
    noisyEngine: true,
    cards: autoCards(4, [right(9000)]),
    expect: ['correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono, automático: una mal y sigue escuchando en la siguiente',
    engine: 'native',
    cards: [{ holdAt: 300, says: [wrong(1200)] }, { says: [right(900)] }, { says: [right(900)] }],
    expect: ['incorrect', 'correct', 'correct'],
  },
  {
    name: 'Sherpa, automático: 5 tarjetas con silencio antes de contestar',
    engine: 'sherpa',
    cards: autoCards(5, [right(6000)]),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: `Automático y nadie habla: se apaga solo tras ${MAX_SILENT_REOPENS} cierres, y contesta escribiendo`,
    engine: 'native',
    cards: [{ holdAt: 300, typesAt: right(60000) }, { says: [right(900)] }],
    expect: ['correct', 'none'],
    autoOffAt: 0,
  },
  {
    name: 'Error del reconocedor en modo automático: no se reabre en bucle, toca y contesta',
    engine: 'native',
    cards: [{ holdAt: 300, says: [right(1200)] }, { errorAt: 500, tapsAt: [3000], says: [right(4000)] }, { tapsAt: [300], says: [right(900)] }],
    expect: ['correct', 'correct', 'correct'],
    autoOffAt: 1,
  },
  {
    name: 'Escribiendo: toca la pantalla (frena la cuenta) y "Siguiente" con doble toque',
    engine: 'native',
    cards: [{ typesAt: right(2000), touchAt: 1000, nextAt: 9000, doubleNext: true }, { typesAt: wrong(1500), nextAt: 500, doubleNext: true }, { typesAt: right(800) }],
    expect: ['correct', 'incorrect', 'correct'],
  },
  {
    name: 'Automático: apaga el micrófono con un toque en la 2ª y contesta escribiendo',
    engine: 'sherpa',
    cards: [{ holdAt: 300, says: [right(1200)] }, { tapsAt: [500], typesAt: right(3000) }, { typesAt: right(900) }],
    expect: ['correct', 'correct', 'correct'],
    autoOffAt: 1,
  },
];

// ─── Correr ────────────────────────────────────────────────────────────────────────────────────

let failures = 0;
for (const sc of scenarios) {
  const out = simulate(sc);
  const problems = [...out.problems];
  sc.expect.forEach((want, i) => {
    const got = out.evaluated.get(i) ?? [];
    if (want === 'none') {
      if (got.length > 0) problems.push(`tarjeta ${i}: se evaluó (${got.join(', ')}) sin que contestara`);
      return;
    }
    if (got.length !== 1) problems.push(`tarjeta ${i}: se evaluó ${got.length} veces (${got.join(', ') || 'ninguna'})`);
    else if (got[0] !== want) problems.push(`tarjeta ${i}: ${got[0]}, se esperaba ${want}`);
  });
  const answeredAll = sc.expect.every((e) => e !== 'none');
  if (answeredAll) {
    if (out.cardsReached !== sc.cards.length) problems.push(`llegó a ${out.cardsReached} de ${sc.cards.length} tarjetas`);
    if (out.finalPhase !== 'finished') problems.push(`terminó en "${out.finalPhase}", no en "finished"`);
  }
  if (sc.autoOffAt !== undefined && !out.autoOffSeen.has(sc.autoOffAt)) problems.push(`el modo automático no se apagó en la tarjeta ${sc.autoOffAt}`);
  if (sc.autoOffAt === undefined && out.autoOffSeen.size > 0 && answeredAll && sc.cards.some((c) => c.holdAt !== undefined)) {
    // En automático, solo se apaga al terminar
    const unexpected = [...out.autoOffSeen].filter((i) => i !== sc.cards.length - 1);
    if (unexpected.length > 0) problems.push(`el modo automático se apagó solo en la tarjeta ${unexpected.join(', ')}`);
  }
  const maxOpens = sc.cards.length * (MAX_SILENT_REOPENS + 3);
  if (out.opens > maxOpens) problems.push(`el micrófono se abrió ${out.opens} veces (¿bucle?)`);

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

const listening = run([{ type: 'cardShown' }, { type: 'micPressed' }, { type: 'micStarted', session: 1 }]).state;
const autoListening = run([{ type: 'cardShown' }, { type: 'holdCompleted' }, { type: 'micStarted', session: 1 }]).state;
const answered = run([{ type: 'heard', session: 1, match: true, final: true }], autoListening).state;
const opens = (r: { effects: PracticeEffect[] }) => r.effects.filter((e) => e.type === 'openMic').length;

const rules: [string, boolean][] = [
  ['un resultado de otra apertura del micrófono no cuenta', run([{ type: 'heard', session: 99, match: true, final: true }], listening).state.phase === 'listening'],
  ['una cuenta de otra tarjeta no pasa de tarjeta', run([{ type: 'countdownDone', turn: 99 }], answered).state.phase === 'answered'],
  ['un resultado parcial que no coincide no evalúa', run([{ type: 'heard', session: 1, match: false, final: false }], listening).state.phase === 'listening'],
  ['un resultado parcial que coincide evalúa enseguida', run([{ type: 'heard', session: 1, match: true, final: false }], listening).state.result === 'correct'],
  ['a mano: al cerrarse solo queda en reposo (no se reabre)', opens(run([{ type: 'micClosed', session: 1 }], listening)) === 0],
  ['automático: al cerrarse solo se reabre una sola vez', opens(run([{ type: 'micClosed', session: 1 }, { type: 'micClosed', session: 1 }], autoListening)) === 1],
  ['tras un error real no se reabre y se apaga el automático', (() => {
    const r = run([{ type: 'micError', session: 1 }, { type: 'micClosed', session: 1 }], autoListening);
    return opens(r) === 0 && !r.state.auto && r.state.phase === 'idle';
  })()],
  ['si no se puede abrir, queda en reposo', run([{ type: 'micClosed', session: 1 }, { type: 'micNotStarted', session: 2 }], autoListening).state.phase === 'idle'],
  ['la voz de Yomi lee después de cerrar el micrófono', (() => {
    const fx = run([{ type: 'heard', session: 1, match: true, final: true }], listening).effects.map((e) => e.type);
    return fx.indexOf('closeMic') >= 0 && fx.indexOf('closeMic') < fx.indexOf('speak');
  })()],
  ['al fallar no se lee la respuesta', !run([{ type: 'heard', session: 1, match: false, final: true }], listening).effects.some((e) => e.type === 'speak')],
  ['escribir con el micrófono abierto lo cierra y evalúa una vez', (() => {
    const r = run([{ type: 'textSubmitted', correct: true }, { type: 'heard', session: 1, match: true, final: true }], listening);
    return r.effects.filter((e) => e.type === 'record').length === 1 && r.effects.some((e) => e.type === 'closeMic');
  })()],
  ['el micrófono no hace nada con la respuesta a la vista', opens(run([{ type: 'micPressed' }], answered)) === 0 && run([{ type: 'micPressed' }], answered).state.phase === 'answered'],
  ['un toque frena la cuenta y luego no pasa sola', run([{ type: 'touched' }, { type: 'countdownDone', turn: answered.turn }], answered).state.phase === 'answered'],
  ['"Siguiente" dos veces pasa una sola tarjeta', run([{ type: 'nextPressed' }, { type: 'nextPressed' }], answered).effects.filter((e) => e.type === 'advance').length === 1],
  ['cambiar de forma apaga todo (micrófono y automático)', (() => {
    const r = run([{ type: 'cardShown' }], autoListening);
    return r.effects.some((e) => e.type === 'closeMic') && !r.state.auto && r.state.phase === 'idle';
  })()],
  ['el micrófono se ve encendido en automático mientras pasa de tarjeta', micLooksOn(run([{ type: 'nextPressed' }], answered).state)],
  ['la última tarjeta termina la práctica sin abrir el micrófono', (() => {
    const adv = run([{ type: 'nextPressed' }], answered).state;
    const r = run([{ type: 'advanced', turn: adv.turn, hasNext: false }], adv);
    return r.state.phase === 'finished' && opens(r) === 0;
  })()],
];
for (const [name, ok] of rules) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures++;
}

console.log(failures === 0 ? '\nTodo bien' : `\n${failures} FALLAN`);
process.exitCode = failures === 0 ? 0 : 1;
