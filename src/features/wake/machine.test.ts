import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Problem } from '@/domain/math/types';

import {
  MAX_ENTRY,
  blocksBack,
  initialState,
  isCorrect,
  reduce,
  type WakeProgress,
  type WakeState,
} from './machine';

/**
 * The reducer that decides when an alarm is allowed to stop. Every rule the
 * product depends on is asserted here: a wrong answer never advances, the
 * challenge only completes on the last required problem, and nothing but a
 * close event can move the screen out of the challenge.
 */

function problem(answer: number, id = `p${answer}`): Problem {
  return { id, prompt: `? = ${answer}`, answer, kind: 'add', difficulty: 'medium' };
}

function progress(overrides: Partial<WakeProgress> = {}): WakeProgress {
  return {
    sessionId: 's1',
    alarmId: 'a1',
    alarmLabel: 'Morning',
    difficulty: 'medium',
    requiredProblems: 3,
    stepIndex: 0,
    wrongCount: 0,
    problem: problem(42),
    problemShownAt: 1000,
    firedAt: 1000,
    firstAnswerAt: null,
    ...overrides,
  };
}

function solving(overrides: Partial<WakeProgress> = {}, entry = ''): WakeState {
  return { phase: 'solving', progress: progress(overrides), entry, wrongAt: null };
}

describe('resolving', () => {
  it('closes when nothing is ringing', () => {
    const next = reduce(initialState, { type: 'no_alarm' });
    assert.deepEqual(next, { phase: 'closed', outcome: 'no_alarm' });
  });

  it('enters solving with the restored progress', () => {
    const restored = progress({ stepIndex: 2, wrongCount: 5 });
    const next = reduce(initialState, { type: 'resumed', progress: restored });
    assert.equal(next.phase, 'solving');
    assert.deepEqual(next.phase === 'solving' ? next.progress : null, restored);
  });

  it('refuses to resume a challenge already under way', () => {
    // Otherwise a second resume — a foreground event racing the cold-start
    // path — would throw away the step the user is on.
    const state = solving({ stepIndex: 2 });
    const next = reduce(state, { type: 'resumed', progress: progress({ stepIndex: 0 }) });
    assert.equal(next, state);
  });
});

describe('a second alarm during a challenge', () => {
  it('drops back to resolving from solving', () => {
    assert.deepEqual(reduce(solving({ stepIndex: 2 }), { type: 'restart' }), {
      phase: 'resolving',
    });
  });

  it('drops back to resolving from dismissing', () => {
    const dismissing = reduce(solving({ stepIndex: 2 }), { type: 'complete', at: 1 });
    assert.deepEqual(reduce(dismissing, { type: 'restart' }), { phase: 'resolving' });
  });

  it('can then resume onto the new alarm', () => {
    const restarted = reduce(solving({ stepIndex: 2 }), { type: 'restart' });
    const next = reduce(restarted, { type: 'resumed', progress: progress({ alarmId: 'a2' }) });
    assert.equal(next.phase === 'solving' ? next.progress.alarmId : null, 'a2');
  });
});

describe('entry', () => {
  it('appends digits', () => {
    let state = solving();
    state = reduce(state, { type: 'digit', digit: 4 });
    state = reduce(state, { type: 'digit', digit: 2 });
    assert.equal(state.phase === 'solving' ? state.entry : null, '42');
  });

  it('stops at the cap rather than silently scrolling', () => {
    let state = solving();
    for (let i = 0; i < MAX_ENTRY + 4; i += 1) {
      state = reduce(state, { type: 'digit', digit: 7 });
    }
    assert.equal(state.phase === 'solving' ? state.entry.length : 0, MAX_ENTRY);
  });

  it('removes one digit at a time on backspace', () => {
    let state = reduce(solving({}, '123'), { type: 'backspace' });
    assert.equal(state.phase === 'solving' ? state.entry : null, '12');
    state = reduce(state, { type: 'backspace' });
    state = reduce(state, { type: 'backspace' });
    state = reduce(state, { type: 'backspace' });
    assert.equal(state.phase === 'solving' ? state.entry : null, '');
  });

  it('clears', () => {
    const state = reduce(solving({}, '123'), { type: 'clear' });
    assert.equal(state.phase === 'solving' ? state.entry : null, '');
  });

  it('leaves an already-empty entry untouched', () => {
    const state = solving();
    assert.equal(reduce(state, { type: 'clear' }), state);
  });

  it('clears the wrong-answer flash as soon as a new digit is typed', () => {
    const flashed = reduce(solving(), { type: 'wrong', problem: problem(7), at: 5000 });
    const typing = reduce(flashed, { type: 'digit', digit: 1 });
    assert.equal(typing.phase === 'solving' ? typing.wrongAt : 'x', null);
  });
});

describe('answering', () => {
  it('counts a wrong answer without advancing the step', () => {
    const state = reduce(solving({ stepIndex: 1 }, '41'), {
      type: 'wrong',
      problem: problem(99),
      at: 5000,
    });
    assert.equal(state.phase, 'solving');
    if (state.phase !== 'solving') return;
    assert.equal(state.progress.stepIndex, 1, 'a wrong answer must never advance the step');
    assert.equal(state.progress.wrongCount, 1);
    assert.equal(state.progress.problem.answer, 99, 'a wrong answer gets a brand-new problem');
    assert.equal(state.entry, '');
    assert.equal(state.wrongAt, 5000);
  });

  it('advances on a correct answer with problems still to go', () => {
    const state = reduce(solving({ stepIndex: 0 }, '42'), {
      type: 'advance',
      problem: problem(13),
      at: 5000,
    });
    assert.equal(state.phase, 'solving');
    if (state.phase !== 'solving') return;
    assert.equal(state.progress.stepIndex, 1);
    assert.equal(state.progress.wrongCount, 0);
    assert.equal(state.progress.problem.answer, 13);
    assert.equal(state.entry, '');
  });

  it('moves to dismissing on the last problem', () => {
    const state = reduce(solving({ stepIndex: 2, requiredProblems: 3 }, '42'), {
      type: 'complete',
      at: 9000,
    });
    assert.equal(state.phase, 'dismissing');
    if (state.phase !== 'dismissing') return;
    assert.equal(state.progress.stepIndex, 3);
  });

  it('pins the first answer time and never moves it again', () => {
    // `solve_ms` is measured from here, so a later answer overwriting it would
    // make every session look faster than it was.
    let state = reduce(solving(), { type: 'wrong', problem: problem(1), at: 4000 });
    state = reduce(state, { type: 'advance', problem: problem(2), at: 8000 });
    state = reduce(state, { type: 'advance', problem: problem(3), at: 12000 });
    assert.equal(state.phase === 'solving' ? state.progress.firstAnswerAt : null, 4000);
  });

  it('pins the first answer time even when the first answer is the last one', () => {
    const state = reduce(solving({ requiredProblems: 1 }), { type: 'complete', at: 4000 });
    assert.equal(state.phase === 'dismissing' ? state.progress.firstAnswerAt : null, 4000);
  });

  it('tracks when the current problem was shown', () => {
    const state = reduce(solving(), { type: 'advance', problem: problem(3), at: 7777 });
    assert.equal(state.phase === 'solving' ? state.progress.problemShownAt : null, 7777);
  });
});

describe('closing', () => {
  it('closes from solving when native stops the alarm underneath', () => {
    const state = reduce(solving({ stepIndex: 1 }), {
      type: 'closed',
      outcome: 'system_stopped',
    });
    assert.deepEqual(state, { phase: 'closed', outcome: 'system_stopped' });
  });

  it('closes from dismissing', () => {
    const dismissing = reduce(solving({ stepIndex: 2 }), { type: 'complete', at: 1 });
    assert.deepEqual(reduce(dismissing, { type: 'closed', outcome: 'solved' }), {
      phase: 'closed',
      outcome: 'solved',
    });
  });

  it('ignores answering events once closed', () => {
    const closed: WakeState = { phase: 'closed', outcome: 'solved' };
    assert.equal(reduce(closed, { type: 'digit', digit: 1 }), closed);
    assert.equal(reduce(closed, { type: 'advance', problem: problem(1), at: 1 }), closed);
  });

  it('ignores answering events while dismissing', () => {
    // The dismissal is a sequence of database and native calls; a stray keypress
    // arriving mid-flight must not restart the challenge.
    const dismissing = reduce(solving({ stepIndex: 2 }), { type: 'complete', at: 1 });
    assert.equal(reduce(dismissing, { type: 'digit', digit: 5 }), dismissing);
    assert.equal(reduce(dismissing, { type: 'wrong', problem: problem(1), at: 2 }), dismissing);
  });
});

describe('isCorrect', () => {
  it('accepts the exact answer', () => {
    assert.ok(isCorrect('42', problem(42)));
  });

  it('accepts leading zeros, which the keypad allows to be typed', () => {
    assert.ok(isCorrect('042', problem(42)));
  });

  it('rejects an empty entry, so a bare submit is never a correct answer', () => {
    assert.ok(!isCorrect('', problem(0)));
  });

  it('rejects a wrong number', () => {
    assert.ok(!isCorrect('41', problem(42)));
  });
});

describe('blocksBack', () => {
  it('refuses back for as long as the alarm could still be ringing', () => {
    assert.ok(blocksBack(initialState));
    assert.ok(blocksBack(solving()));
    assert.ok(blocksBack(reduce(solving({ stepIndex: 2 }), { type: 'complete', at: 1 })));
  });

  it('allows back once the screen is closed', () => {
    assert.ok(!blocksBack({ phase: 'closed', outcome: 'solved' }));
  });
});
