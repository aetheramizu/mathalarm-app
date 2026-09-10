/**
 * The shapes the math engine trades in.
 *
 * Only the types live here in P1 — the generator itself is P2. They are needed
 * this early because a challenge in flight is persisted, so the data layer has
 * to know what a problem looks like.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ProblemKind = 'add' | 'sub' | 'mul' | 'mixed' | 'linear';

export type Problem = {
  /**
   * Unique to one *shown* question, not to its text — the same equation drawn
   * twice is two problems. This is the key a future `question_attempts` row
   * would hang off.
   */
  id: string;
  /** What the user reads: "47 + 28" or "3x + 4 = 19". */
  prompt: string;
  /** Always an integer, and never negative. */
  answer: number;
  kind: ProblemKind;
  difficulty: Difficulty;
};
