import { GENERATORS } from './generators';
import type { Difficulty, Problem, RNG } from './types';

/**
 * The math engine.
 *
 * Pure TypeScript with no React, no native module and no database behind it,
 * which is what lets the whole difficulty ladder be exercised on the host
 * instead of on a phone at 6am.
 */

/** How many correct answers each tier demands before the alarm will stop. */
export const REQUIRED_PROBLEMS: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

export type GenerateOptions = {
  /** Injected so tests can seed it. Defaults to `Math.random`. */
  rng?: RNG;
  /**
   * The answer to the problem being replaced.
   *
   * A wrong answer draws a brand-new problem, and if that replacement happened
   * to share the previous answer, the number the user had already typed would
   * suddenly be correct — the app would look like it rewarded a wrong guess.
   */
  avoidAnswer?: number;
};

/**
 * Easy tiers have few possible answers, so a rejected draw is common; this is
 * the point at which the engine stops insisting and returns what it has rather
 * than spinning while an alarm rings. With two-digit-plus ranges everywhere but
 * `easy`, exhausting it is effectively impossible.
 */
const MAX_DRAWS = 50;

export function generateProblem(
  difficulty: Difficulty,
  options: GenerateOptions = {}
): Problem {
  const rng = options.rng ?? Math.random;
  const pool = GENERATORS[difficulty];

  let generated = drawFrom(pool, rng);
  for (let draw = 1; draw < MAX_DRAWS && generated.answer === options.avoidAnswer; draw += 1) {
    generated = drawFrom(pool, rng);
  }

  return {
    id: newProblemId(rng),
    prompt: generated.prompt,
    answer: generated.answer,
    kind: generated.kind,
    difficulty,
  };
}

function drawFrom(pool: (typeof GENERATORS)[Difficulty], rng: RNG) {
  return pool[Math.floor(rng() * pool.length)](rng);
}

/**
 * Identifies one *shown* question — the same equation drawn twice is two
 * problems, and a future `question_attempts` row would key on this.
 *
 * Drawn from the injected RNG rather than `Date.now()` or `Math.random`, so a
 * seeded run reproduces the ids along with the questions.
 */
function newProblemId(rng: RNG): string {
  const chunk = () =>
    Math.floor(rng() * 0xffffffff)
      .toString(36)
      .padStart(7, '0');
  return `p_${chunk()}${chunk()}`;
}
