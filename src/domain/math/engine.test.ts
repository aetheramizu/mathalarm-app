import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REQUIRED_PROBLEMS, generateProblem } from './engine';
import type { Difficulty, Problem, ProblemKind, RNG } from './types';

/**
 * The math engine is the one part of MathAlarm that can be proven correct
 * without a device, so these tests are thorough on purpose: a generator that
 * emits an unanswerable problem is only discovered at 6am, by an alarm that
 * cannot be switched off.
 *
 * The core check re-derives every answer by independently evaluating the
 * prompt the user would read. That is deliberately not how the generators
 * work — they carry the answer alongside the prompt — so the two have to agree
 * by construction rather than by sharing code.
 */

/** mulberry32: small, seeded, and stable, so a failure reproduces exactly. */
function seeded(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const ALLOWED_KINDS: Record<Difficulty, ProblemKind[]> = {
  easy: ['add', 'sub'],
  medium: ['add', 'sub', 'mul'],
  hard: ['mul', 'mixed', 'linear'],
};

/** A run of problems from one seeded stream. */
function sample(difficulty: Difficulty, count: number, seed = 1): Problem[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => generateProblem(difficulty, { rng }));
}

const LINEAR = /^(\d+)x ([+-]) (\d+) = (\d+)$/;

/**
 * Evaluates a prompt from scratch, honouring precedence, and returns what the
 * answer has to be. Written independently of the generators on purpose.
 */
function solve(prompt: string): number {
  const linear = LINEAR.exec(prompt);
  if (linear) {
    const [, a, sign, b, c] = linear;
    // ax ± b = c  →  x = (c ∓ b) / a
    const rhs = sign === '+' ? Number(c) - Number(b) : Number(c) + Number(b);
    assert.equal(rhs % Number(a), 0, `linear equation has no whole solution: ${prompt}`);
    return rhs / Number(a);
  }

  const tokens = prompt.split(' ');
  assert.ok(tokens.length % 2 === 1 && tokens.length >= 3, `unparseable prompt: ${prompt}`);

  // Multiplication first, collapsing each `a * b` in place.
  const flat: string[] = [];
  for (const token of tokens) {
    if (flat.length >= 2 && flat[flat.length - 1] === '*') {
      const left = Number(flat[flat.length - 2]);
      flat.length -= 2;
      flat.push(String(left * Number(token)));
      continue;
    }
    flat.push(token);
  }

  let total = Number(flat[0]);
  for (let i = 1; i < flat.length; i += 2) {
    const value = Number(flat[i + 1]);
    total += flat[i] === '+' ? value : -value;
  }
  return total;
}

describe('REQUIRED_PROBLEMS', () => {
  it('is the locked v1 ladder: easy 1, medium 3, hard 5', () => {
    assert.deepEqual(REQUIRED_PROBLEMS, { easy: 1, medium: 3, hard: 5 });
  });
});

describe('generateProblem', () => {
  for (const difficulty of DIFFICULTIES) {
    describe(difficulty, () => {
      const problems = sample(difficulty, 4000);

      it('answers the prompt it shows', () => {
        for (const problem of problems) {
          assert.equal(
            problem.answer,
            solve(problem.prompt),
            `${problem.prompt} was labelled ${problem.answer}`
          );
        }
      });

      it('only ever answers with a non-negative integer', () => {
        for (const problem of problems) {
          assert.ok(Number.isInteger(problem.answer), `not an integer: ${problem.prompt}`);
          assert.ok(problem.answer >= 0, `negative answer: ${problem.prompt}`);
        }
      });

      it('writes prompts in plain ASCII on a single line', () => {
        for (const problem of problems) {
          assert.match(problem.prompt, /^[ -~]+$/, `non-ASCII prompt: ${problem.prompt}`);
          assert.ok(problem.prompt.length <= 20, `prompt too long: ${problem.prompt}`);
        }
      });

      it('tags every problem with its own tier and an allowed kind', () => {
        for (const problem of problems) {
          assert.equal(problem.difficulty, difficulty);
          assert.ok(
            ALLOWED_KINDS[difficulty].includes(problem.kind),
            `${problem.kind} is not a ${difficulty} kind`
          );
        }
      });

      it('gives each shown question its own id', () => {
        const ids = new Set(problems.map((problem) => problem.id));
        // Ids are 64 bits of the stream; a handful of collisions across 4000
        // draws would still be tolerable, but a generator reusing one id would
        // not be.
        assert.ok(ids.size > problems.length * 0.99, `only ${ids.size} distinct ids`);
      });

      it('covers every shape in its pool', () => {
        const kinds = new Set(problems.map((problem) => problem.kind));
        assert.deepEqual([...kinds].sort(), [...ALLOWED_KINDS[difficulty]].sort());
      });

      it('never repeats the answer it was told to avoid', () => {
        const rng = seeded(7);
        // Easy has the smallest answer space, so a rejected draw is most likely
        // to matter there; the loop runs the same way for every tier.
        for (const avoidAnswer of [0, 1, 5, 8, 12, 42, 100]) {
          for (let i = 0; i < 300; i += 1) {
            const problem = generateProblem(difficulty, { rng, avoidAnswer });
            assert.notEqual(
              problem.answer,
              avoidAnswer,
              `replacement repeated the avoided answer: ${problem.prompt}`
            );
          }
        }
      });
    });
  }

  it('is reproducible from a seed', () => {
    for (const difficulty of DIFFICULTIES) {
      assert.deepEqual(sample(difficulty, 50, 99), sample(difficulty, 50, 99));
    }
  });

  it('produces different problems from different seeds', () => {
    const a = sample('medium', 20, 1).map((problem) => problem.prompt);
    const b = sample('medium', 20, 2).map((problem) => problem.prompt);
    assert.notDeepEqual(a, b);
  });

  it('defaults to Math.random when no rng is injected', () => {
    const prompts = new Set(
      Array.from({ length: 50 }, () => generateProblem('hard').prompt)
    );
    assert.ok(prompts.size > 1);
  });
});

describe('difficulty content', () => {
  it('keeps easy to single-digit addition and subtraction', () => {
    for (const problem of sample('easy', 2000)) {
      const operands = problem.prompt.split(' ').filter((token) => /^\d+$/.test(token));
      assert.equal(operands.length, 2);
      for (const operand of operands) {
        assert.ok(Number(operand) < 10, `not single-digit: ${problem.prompt}`);
      }
    }
  });

  it('keeps medium at two-digit sums and single-digit multipliers', () => {
    for (const problem of sample('medium', 2000)) {
      const [left, , right] = problem.prompt.split(' ');
      if (problem.kind === 'mul') {
        assert.ok(Number(left) < 10, `multiplier is not single-digit: ${problem.prompt}`);
        assert.ok(Number(right) >= 10, `multiplicand is not two-digit: ${problem.prompt}`);
      } else {
        assert.ok(Number(left) >= 10 && Number(right) >= 10, `not two-digit: ${problem.prompt}`);
      }
    }
  });

  it('makes hard mixed problems depend on precedence', () => {
    const mixed = sample('hard', 3000).filter((problem) => problem.kind === 'mixed');
    assert.ok(mixed.length > 0);
    let precedenceSensitive = 0;
    for (const problem of mixed) {
      const [a, op, b, , c] = problem.prompt.split(' ');
      if (op !== '+') {
        // The `b * c - a` shape puts the product first, so left-to-right and
        // correct evaluation agree; it tests multi-step arithmetic, not
        // precedence.
        assert.equal(op, '*', `unexpected mixed shape: ${problem.prompt}`);
        continue;
      }
      // Evaluated naively left to right, `a + b * c` gives a different number.
      // That is what makes the tier hard rather than merely long.
      assert.notEqual(
        (Number(a) + Number(b)) * Number(c),
        problem.answer,
        `precedence does not matter: ${problem.prompt}`
      );
      precedenceSensitive += 1;
    }
    assert.ok(precedenceSensitive > 0, 'no precedence-sensitive problems were generated');
  });

  it('solves hard linear equations with a whole x', () => {
    const linear = sample('hard', 3000).filter((problem) => problem.kind === 'linear');
    assert.ok(linear.length > 0);
    for (const problem of linear) {
      const match = LINEAR.exec(problem.prompt);
      if (!match) assert.fail(`not a linear equation: ${problem.prompt}`);
      const [, a, sign, b, c] = match;
      const substituted =
        sign === '+'
          ? Number(a) * problem.answer + Number(b)
          : Number(a) * problem.answer - Number(b);
      assert.equal(substituted, Number(c), `x does not satisfy: ${problem.prompt}`);
      assert.ok(Number(c) > 0, `right-hand side is not positive: ${problem.prompt}`);
    }
  });
});
