import type { Difficulty, ProblemKind, RNG } from './types';

/**
 * The problem shapes behind each difficulty tier.
 *
 * Every generator returns the question and its answer together; nothing here
 * parses or evaluates a prompt at runtime, so the string the user reads and the
 * number they have to type can never drift apart.
 *
 * Two rules hold across every tier, and the tests assert them for all of them:
 * the answer is a non-negative integer, and the prompt is plain ASCII. The
 * first is because the keypad has no minus key and no decimal point at 6am; the
 * second because the wake screen is rendered in a monospaced face where a `×`
 * or a `−` would risk a fallback glyph.
 */

export type GeneratedProblem = {
  prompt: string;
  answer: number;
  kind: ProblemKind;
};

export type Generator = (rng: RNG) => GeneratedProblem;

/** Inclusive on both ends. */
function intBetween(rng: RNG, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: RNG, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

// --- Easy: single-digit + / − ------------------------------------------------

const easyAdd: Generator = (rng) => {
  const a = intBetween(rng, 2, 9);
  const b = intBetween(rng, 2, 9);
  return { prompt: `${a} + ${b}`, answer: a + b, kind: 'add' };
};

const easySub: Generator = (rng) => {
  // The larger operand is drawn first and the smaller from below it, so the
  // answer can never go negative — the keypad cannot express a minus sign.
  const a = intBetween(rng, 3, 9);
  const b = intBetween(rng, 1, a - 1);
  return { prompt: `${a} - ${b}`, answer: a - b, kind: 'sub' };
};

// --- Medium: two-digit + / −, single-digit × two-digit -----------------------

const mediumAdd: Generator = (rng) => {
  const a = intBetween(rng, 11, 99);
  const b = intBetween(rng, 11, 99);
  return { prompt: `${a} + ${b}`, answer: a + b, kind: 'add' };
};

const mediumSub: Generator = (rng) => {
  const a = intBetween(rng, 25, 99);
  const b = intBetween(rng, 11, a - 10);
  return { prompt: `${a} - ${b}`, answer: a - b, kind: 'sub' };
};

const mediumMul: Generator = (rng) => {
  const a = intBetween(rng, 3, 9);
  const b = intBetween(rng, 11, 49);
  return { prompt: `${a} * ${b}`, answer: a * b, kind: 'mul' };
};

// --- Hard: multi-digit ×, mixed precedence, linear equations -----------------

const hardMul: Generator = (rng) => {
  const a = intBetween(rng, 12, 99);
  const b = intBetween(rng, 11, 29);
  return { prompt: `${a} * ${b}`, answer: a * b, kind: 'mul' };
};

/**
 * Mixed operations with real precedence — the multiplication genuinely binds
 * tighter, so answering left-to-right gives the wrong number. That is the
 * point of the tier.
 */
const hardMixedAdd: Generator = (rng) => {
  const a = intBetween(rng, 11, 60);
  const b = intBetween(rng, 3, 9);
  const c = intBetween(rng, 3, 12);
  return { prompt: `${a} + ${b} * ${c}`, answer: a + b * c, kind: 'mixed' };
};

const hardMixedSub: Generator = (rng) => {
  const b = intBetween(rng, 4, 9);
  const c = intBetween(rng, 5, 12);
  // Drawn strictly below the product, so the result stays non-negative.
  const a = intBetween(rng, 1, b * c - 1);
  return { prompt: `${b} * ${c} - ${a}`, answer: b * c - a, kind: 'mixed' };
};

/**
 * Built backwards from the solution rather than forwards from the coefficients,
 * which is what guarantees `x` is a whole number instead of a fraction the
 * keypad could not express.
 */
const hardLinear: Generator = (rng) => {
  const x = intBetween(rng, 2, 15);
  const a = intBetween(rng, 2, 9);
  const sign = pick(rng, ['+', '-'] as const);

  if (sign === '+') {
    const b = intBetween(rng, 2, 40);
    return { prompt: `${a}x + ${b} = ${a * x + b}`, answer: x, kind: 'linear' };
  }

  // `ax - b = c` needs c above zero, so b stays below the product. The lowest
  // possible product here is 2 * 2, so there is always a value to draw.
  const b = intBetween(rng, 2, a * x - 1);
  return { prompt: `${a}x - ${b} = ${a * x - b}`, answer: x, kind: 'linear' };
};

/**
 * The pool each tier draws from. A tier's pool is deliberately flat — every
 * shape is equally likely — because weighting them would be tuning difficulty
 * by feel with no data behind it.
 */
export const GENERATORS: Record<Difficulty, readonly Generator[]> = {
  easy: [easyAdd, easySub],
  medium: [mediumAdd, mediumSub, mediumMul],
  hard: [hardMul, hardMixedAdd, hardMixedSub, hardLinear],
};
