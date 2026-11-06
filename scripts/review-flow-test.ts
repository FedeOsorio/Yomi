import {
  ANSWER_VISIBLE_MS,
  initialVoiceFlow,
  MAX_VOICE_ATTEMPTS,
  NextCard,
  SPEECH_SAFETY_MS,
  stepVoiceFlow,
  VOICE_TIMEOUT_MS,
  VoiceEffect,
  VoiceEvent,
  VoiceFlowState,
} from '../lib/review-flow';

/**
 * Prueba del recorrido del repaso por voz (lib/review-flow.ts) sin teléfono: un simulador con reloj virtual
 * ejecuta los efectos con un micrófono, una voz y animaciones falsas que se comportan como los reales, y
 * corre sesiones completas de varias tarjetas.
 *
 *   npm run test:review
 *
 * Los reconocedores imitan lo que hace cada librería:
 * - 'native' (el del teléfono): se cierra solo tras unos segundos de silencio o después de cada frase final.
 *   Por eso el recorrido tiene que reabrirlo (el error que dejaba el micrófono trabado desde la 2ª tarjeta).
 * - 'sherpa': escucha de corrido; solo se cierra cuando se lo pide la app.
 *
 * Después de cada sesión se comprueba: cada tarjeta de voz se evalúa y se guarda exactamente una vez, nunca hay
 * dos micrófonos abiertos, el micrófono nunca queda abierto con la respuesta a la vista, y la sesión termina.
 */

const NATIVE_SILENCE_MS = 4000; // el del teléfono se cierra si nadie habla en ~4 s
const MIC_START_MS = 60;
const FLIP_MS = 300;
const SPEECH_MS = 900;

type Engine = 'native' | 'sherpa';
/** Qué hace el usuario en una tarjeta: dice algo a los `at` ms de que la tarjeta aparece */
type Say = { at: number; correct: boolean };
interface CardScript {
  kind?: 'voice' | 'buttons';
  says?: Say[];
  /** "No lo sé" a los `giveUpAt` ms */
  giveUpAt?: number;
  /** "Siguiente" con la respuesta a la vista, a los `nextAt` ms de evaluada (antes de que pase sola) */
  nextAt?: number;
  /** Toca "Siguiente" dos veces seguidas */
  doubleNext?: boolean;
}
interface Scenario {
  name: string;
  engine: Engine;
  cards: CardScript[];
  /** La voz de Yomi: avisa normal, nunca avisa, o avisa dos veces */
  tts?: 'normal' | 'never' | 'twice';
  /** El reconocedor repite "terminó" (dos avisos por cierre) y entrega un resultado tarde */
  noisyEngine?: boolean;
  /** Se sale de la pantalla a los `ms` de empezar la tarjeta `card` */
  interruptAt?: { card: number; ms: number };
  /** Al volver (tras interrumpir), el usuario toca el micrófono a los `ms` */
  resumeMicAt?: { card: number; ms: number };
}

interface Outcome {
  evaluated: Map<number, ('correct' | 'incorrect')[]>;
  saved: Map<number, number>;
  problems: string[];
  finalPhase: string;
  cardsReached: number;
}

function simulate(sc: Scenario): Outcome {
  let state: VoiceFlowState = initialVoiceFlow;
  let now = 0;
  let seq = 0;
  const queue: { at: number; seq: number; ev: VoiceEvent | (() => void); tag?: string }[] = [];
  const schedule = (delay: number, ev: VoiceEvent | (() => void), tag?: string) => queue.push({ at: now + delay, seq: seq++, ev, tag });
  const cancel = (tag: string) => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].tag === tag) queue.splice(i, 1);
  };

  const out: Outcome = { evaluated: new Map(), saved: new Map(), problems: [], finalPhase: '', cardsReached: 1 };
  let cardIndex = 0;
  let cardStartedAt = 0;
  let openSession: number | null = null;
  let pendingSave = false;
  let silenceTag = '';

  const nextKind = (): NextCard => {
    const next = sc.cards[cardIndex + 1];
    if (!next) return 'end';
    return next.kind === 'buttons' ? 'buttons' : 'voice';
  };

  /** El usuario dice algo: lo oye el micrófono abierto en ese momento (si hay uno) */
  const userSays = (say: Say) => {
    if (openSession === null || state.phase !== 'listening') return;
    const session = openSession;
    const final = true;
    dispatch({ type: 'heard', session, match: say.correct, final: false });
    dispatch({ type: 'heard', session, match: say.correct, final });
    if (sc.engine === 'native' && !say.correct) {
      // El del teléfono se cierra después de cada frase final
      closeByEngine(session, 30);
    }
  };

  const closeByEngine = (session: number, delay: number) => {
    schedule(delay, () => {
      if (openSession === session) openSession = null;
      dispatch({ type: 'micClosed', session });
      if (sc.noisyEngine) dispatch({ type: 'micClosed', session }); // "terminó" repetido
    });
  };

  const scheduleCard = () => {
    const card = sc.cards[cardIndex];
    if (!card) return;
    cardStartedAt = now;
    for (const say of card.says ?? []) schedule(say.at, () => userSays(say), `card-${cardIndex}`);
    if (card.giveUpAt !== undefined) schedule(card.giveUpAt, { type: 'giveUp' }, `card-${cardIndex}`);
    if (sc.interruptAt?.card === cardIndex) schedule(sc.interruptAt.ms, { type: 'interrupted' }, `card-${cardIndex}`);
    if (sc.resumeMicAt?.card === cardIndex) schedule(sc.resumeMicAt.ms, { type: 'micPressed' }, `card-${cardIndex}`);
  };

  const run = (effects: VoiceEffect[]) => {
    for (const fx of effects) {
      switch (fx.type) {
        case 'openMic':
          if (openSession !== null) out.problems.push(`t=${now}: se abrió el micrófono ${fx.session} con el ${openSession} todavía abierto`);
          openSession = fx.session;
          schedule(MIC_START_MS, { type: 'micStarted', session: fx.session });
          if (sc.engine === 'native') {
            silenceTag = `silence-${fx.session}`;
            schedule(MIC_START_MS + NATIVE_SILENCE_MS, () => {
              if (openSession === fx.session) closeByEngine(fx.session, 0);
            }, silenceTag);
          }
          break;
        case 'closeMic':
          if (openSession !== null && sc.noisyEngine) {
            // Un resultado que llega tarde, después de cerrarlo: no debe mover nada
            const late = openSession;
            schedule(20, { type: 'heard', session: late, match: true, final: true });
          }
          openSession = null;
          cancel(silenceTag);
          break;
        case 'startTimer':
          if (queue.some((q) => q.tag === 'timer')) out.problems.push(`t=${now}: se arrancó el tiempo con otro corriendo`);
          schedule(VOICE_TIMEOUT_MS, { type: 'timeUp', turn: fx.turn }, 'timer');
          break;
        case 'stopTimer':
          cancel('timer');
          break;
        case 'reveal': {
          const list = out.evaluated.get(cardIndex) ?? [];
          list.push(fx.correct ? 'correct' : 'incorrect');
          out.evaluated.set(cardIndex, list);
          pendingSave = true;
          if (openSession !== null) out.problems.push(`t=${now}: tarjeta ${cardIndex} evaluada con el micrófono abierto`);
          schedule(FLIP_MS, { type: 'flipDone', turn: fx.turn });
          const card = sc.cards[cardIndex];
          if (card?.nextAt !== undefined) {
            schedule(card.nextAt, { type: 'nextPressed' });
            if (card.doubleNext) schedule(card.nextAt + 5, { type: 'nextPressed' });
          }
          break;
        }
        case 'speak':
          if (openSession !== null) out.problems.push(`t=${now}: la voz de Yomi habla con el micrófono abierto`);
          if (sc.tts !== 'never') schedule(SPEECH_MS, { type: 'speechDone', turn: fx.turn }, 'speech');
          if (sc.tts === 'twice') schedule(SPEECH_MS + 10, { type: 'speechDone', turn: fx.turn }, 'speech');
          schedule(SPEECH_SAFETY_MS, { type: 'speechDone', turn: fx.turn }, 'speech'); // seguro del hook
          break;
        case 'stopSpeech':
          cancel('speech');
          break;
        case 'startCountdown':
          schedule(ANSWER_VISIBLE_MS, { type: 'countdownDone', turn: fx.turn }, 'countdown');
          break;
        case 'cancelCountdown':
          cancel('countdown');
          break;
        case 'saveAnswer':
          if (pendingSave) {
            out.saved.set(cardIndex, (out.saved.get(cardIndex) ?? 0) + 1);
            pendingSave = false;
          }
          break;
        case 'advance': {
          const turn = fx.turn;
          schedule(FLIP_MS, () => {
            const next = nextKind();
            cancel(`card-${cardIndex}`);
            if (next !== 'end') {
              cardIndex++;
              out.cardsReached = cardIndex + 1;
            }
            dispatch({ type: 'advanced', turn, next });
            if (next === 'buttons') {
              // Tarjeta de botones: se responde con un botón y aparece la siguiente
              schedule(500, () => {
                const after = nextKind();
                if (after !== 'end') {
                  cardIndex++;
                  out.cardsReached = cardIndex + 1;
                  dispatch({ type: 'cardShown' });
                  // De una tarjeta de botones a una de voz, el micrófono se abre tocándolo
                  schedule(200, { type: 'micPressed' });
                  scheduleCard();
                }
              });
            } else if (next === 'voice') {
              scheduleCard();
            }
          });
          break;
        }
        case 'markIncorrect':
        case 'feedback':
        case 'resetCard':
          break;
      }
    }
  };

  const dispatch = (ev: VoiceEvent) => {
    const step = stepVoiceFlow(state, ev);
    state = step.state;
    run(step.effects);
    if (openSession !== null && ['revealing', 'speaking', 'countdown', 'answered'].includes(state.phase)) {
      out.problems.push(`t=${now}: micrófono abierto con la respuesta a la vista (${state.phase})`);
    }
  };

  // La primera tarjeta: el usuario toca el micrófono
  dispatch({ type: 'cardShown' });
  scheduleCard();
  schedule(100, { type: 'micPressed' });

  while (queue.length > 0 && now < 600000) {
    queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const item = queue.shift()!;
    now = item.at;
    if (typeof item.ev === 'function') item.ev();
    else dispatch(item.ev);
  }
  out.finalPhase = state.phase;
  void cardStartedAt;
  return out;
}

// ─── Escenarios ────────────────────────────────────────────────────────────────────────────────

const right = (at: number): Say => ({ at, correct: true });
const wrong = (at: number): Say => ({ at, correct: false });
const voiceCards = (n: number, says: Say[]) => Array.from({ length: n }, () => ({ says }));

const scenarios: (Scenario & { expect: ('correct' | 'incorrect' | 'buttons')[] })[] = [
  {
    name: 'Teléfono: 5 tarjetas, contesta enseguida',
    engine: 'native',
    cards: voiceCards(5, [right(800)]),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono: 5 tarjetas, lee 6 s en silencio antes de contestar (el error de la 2ª tarjeta)',
    engine: 'native',
    cards: voiceCards(5, [right(6000)]),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono: silencio largo, avisos de cierre repetidos y resultados tardíos',
    engine: 'native',
    noisyEngine: true,
    cards: voiceCards(4, [right(9000)]),
    expect: ['correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'Teléfono: dos fallos y acierta al tercero',
    engine: 'native',
    cards: voiceCards(3, [wrong(1000), wrong(2500), right(4000)]),
    expect: ['correct', 'correct', 'correct'],
  },
  {
    name: `Teléfono: ${MAX_VOICE_ATTEMPTS} fallos`,
    engine: 'native',
    cards: voiceCards(2, [wrong(1000), wrong(2500), wrong(4000)]),
    expect: ['incorrect', 'incorrect'],
  },
  {
    name: 'Teléfono: no dice nada y se acaba el tiempo',
    engine: 'native',
    cards: voiceCards(3, []),
    expect: ['incorrect', 'incorrect', 'incorrect'],
  },
  {
    name: 'Sherpa: 5 tarjetas con silencio antes de contestar',
    engine: 'sherpa',
    cards: voiceCards(5, [right(6000)]),
    expect: ['correct', 'correct', 'correct', 'correct', 'correct'],
  },
  {
    name: 'La voz de Yomi nunca avisa que terminó',
    engine: 'native',
    tts: 'never',
    cards: voiceCards(3, [right(1000)]),
    expect: ['correct', 'correct', 'correct'],
  },
  {
    name: 'La voz de Yomi avisa dos veces',
    engine: 'native',
    tts: 'twice',
    cards: voiceCards(3, [right(1000)]),
    expect: ['correct', 'correct', 'correct'],
  },
  {
    name: '"No lo sé" y doble toque en "Siguiente"',
    engine: 'native',
    cards: [{ giveUpAt: 1500, nextAt: 400, doubleNext: true }, { says: [right(1000)], nextAt: 1500, doubleNext: true }, { says: [right(1000)] }],
    expect: ['incorrect', 'correct', 'correct'],
  },
  {
    name: 'Mazo mixto: voz, botones, voz',
    engine: 'native',
    cards: [{ says: [right(1000)] }, { kind: 'buttons' }, { says: [right(1000)] }],
    expect: ['correct', 'buttons', 'correct'],
  },
  {
    name: 'Sale de la pantalla escuchando y al volver toca el micrófono',
    engine: 'native',
    interruptAt: { card: 1, ms: 1500 },
    resumeMicAt: { card: 1, ms: 3000 },
    cards: [{ says: [right(1000)] }, { says: [right(5000)] }, { says: [right(1000)] }],
    expect: ['correct', 'correct', 'correct'],
  },
];

// ─── Correr ────────────────────────────────────────────────────────────────────────────────────

let failures = 0;
for (const sc of scenarios) {
  const out = simulate(sc);
  const problems = [...out.problems];
  sc.expect.forEach((want, i) => {
    const got = out.evaluated.get(i) ?? [];
    if (want === 'buttons') {
      if (got.length > 0) problems.push(`tarjeta ${i} (botones) se evaluó por voz`);
      return;
    }
    if (got.length !== 1) problems.push(`tarjeta ${i}: se evaluó ${got.length} veces (${got.join(', ') || 'ninguna'})`);
    else if (got[0] !== want) problems.push(`tarjeta ${i}: ${got[0]}, se esperaba ${want}`);
    const saved = out.saved.get(i) ?? 0;
    if (saved !== 1) problems.push(`tarjeta ${i}: se guardó ${saved} veces`);
  });
  if (out.cardsReached !== sc.cards.length) problems.push(`llegó a ${out.cardsReached} de ${sc.cards.length} tarjetas`);
  if (out.finalPhase !== 'idle') problems.push(`terminó en "${out.finalPhase}", no en reposo`);

  console.log(`${problems.length === 0 ? '✓' : '✗'} ${sc.name}`);
  problems.forEach((p) => console.log(`    ${p}`));
  if (problems.length > 0) failures++;
}

// ─── Reglas sueltas ────────────────────────────────────────────────────────────────────────────

const run = (events: VoiceEvent[], from: VoiceFlowState = initialVoiceFlow) =>
  events.reduce((acc, ev) => {
    const step = stepVoiceFlow(acc.state, ev);
    return { state: step.state, effects: [...acc.effects, ...step.effects] };
  }, { state: from, effects: [] as VoiceEffect[] });

const listening = run([{ type: 'cardShown' }, { type: 'micPressed' }, { type: 'micStarted', session: 1 }]).state;
const rules: [string, boolean][] = [
  ['un resultado de otra apertura del micrófono no cuenta', run([{ type: 'heard', session: 99, match: true, final: true }], listening).state.phase === 'listening'],
  ['un "se acabó el tiempo" de otra tarjeta no cuenta', run([{ type: 'timeUp', turn: 99 }], listening).state.phase === 'listening'],
  ['tras un error real no se reabre solo', run([{ type: 'micError', session: 1 }, { type: 'micClosed', session: 1 }], listening).effects.every((e) => e.type !== 'openMic')],
  ['al cerrarse solo se reabre una sola vez', run([{ type: 'micClosed', session: 1 }, { type: 'micClosed', session: 1 }], listening).effects.filter((e) => e.type === 'openMic').length === 1],
  ['al reabrirse el tiempo sigue (no se detiene ni se reinicia)', run([{ type: 'micClosed', session: 1 }, { type: 'micStarted', session: 2 }], listening).effects.every((e) => e.type !== 'startTimer' && e.type !== 'stopTimer')],
  ['"Marcar incorrecta" solo después de un acierto', run([{ type: 'markIncorrect' }], listening).effects.length === 0],
  ['si no se puede reabrir, queda en reposo (no escuchando con el micrófono cerrado)', run([{ type: 'micClosed', session: 1 }, { type: 'micNotStarted', session: 2 }], listening).state.phase === 'idle'],
  ['el botón del micrófono no hace nada con la respuesta a la vista', run([{ type: 'heard', session: 1, match: true, final: true }, { type: 'micPressed' }], listening).effects.filter((e) => e.type === 'openMic').length === 0],
];
for (const [name, ok] of rules) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures++;
}

console.log(failures === 0 ? '\nTodo bien' : `\n${failures} FALLAN`);
process.exitCode = failures === 0 ? 0 : 1;
