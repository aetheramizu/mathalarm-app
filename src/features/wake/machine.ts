import type { Difficulty, Problem } from '@/domain/math/types';

/**
 * The wake screen's state machine — a plain reducer, no library.
 *
 * It is deliberately pure and imports nothing but types, which is what lets it
 * be tested on the host: this is the code that decides whether an alarm stops,
 * and it must not be reachable only by setting a real alarm for 6am.
 *
 * It also decides nothing about persistence. Every event here describes
 * something that has *already been written to the database* — the caller
 * records the answer and saves the challenge row first, then dispatches. That
 * ordering is the whole crash-safety story: what is on screen is never ahead of
 * what survives process death.
 */

/** The typed answer is capped well above any answer the generator produces. */
export const MAX_ENTRY = 6;

export type WakeProgress = {
  sessionId: string;
  alarmId: string;
  alarmLabel: string | null;
  difficulty: Difficulty;
  requiredProblems: number;
  /** Problems already solved, and therefore the index of the current one. */
  stepIndex: number;
  wrongCount: number;
  problem: Problem;
  /** When the current problem went on screen. In memory only. */
  problemShownAt: number;
  firedAt: number;
  firstAnswerAt: number | null;
  alarmHour: number;
};

/** Why the screen closed. `no_alarm` means there was nothing ringing to begin with. */
export type ClosedOutcome = 'solved' | 'no_alarm' | 'system_stopped' | 'cancelled' | 'abandoned';

export type WakeState =
  | { phase: 'resolving' }
  | {
      phase: 'solving';
      progress: WakeProgress;
      entry: string;
      /** Timestamp of the last wrong answer, which drives the wrong-answer flash. */
      wrongAt: number | null;
    }
  | { phase: 'dismissing'; progress: WakeProgress }
  | { phase: 'closed'; outcome: ClosedOutcome };

export type WakeEvent =
  | { type: 'no_alarm' }
  | { type: 'resumed'; progress: WakeProgress }
  /** A different alarm is now ringing — throw this challenge away and resolve again. */
  | { type: 'restart' }
  | { type: 'digit'; digit: number }
  /** Remove the last digit typed. */
  | { type: 'backspace' }
  /** Throw the whole entry away. */
  | { type: 'clear' }
  /** A wrong answer: recorded, replaced with a new problem, no step gained. */
  | { type: 'wrong'; problem: Problem; at: number }
  /** A correct answer with problems still to go. */
  | { type: 'advance'; problem: Problem; at: number }
  /** The last correct answer. The alarm is on its way out. */
  | { type: 'complete'; at: number }
  | { type: 'closed'; outcome: ClosedOutcome };

export const initialState: WakeState = { phase: 'resolving' };

export function reduce(state: WakeState, event: WakeEvent): WakeState {
  // Closing wins from anywhere: native can stop the alarm underneath the screen
  // at any moment, and there is no state in which continuing would be right.
  if (event.type === 'closed') return { phase: 'closed', outcome: event.outcome };
  if (event.type === 'no_alarm') return { phase: 'closed', outcome: 'no_alarm' };

  // Deliberately allowed from `dismissing` as well as `solving`: a second alarm
  // can start ringing while the first one's dismissal is still in flight, and
  // the screen has to end up on whatever is actually making noise.
  if (event.type === 'restart') return { phase: 'resolving' };

  if (event.type === 'resumed') {
    // Only ever entered from `resolving`. Re-entering it later would restart a
    // challenge the user is already partway through.
    if (state.phase !== 'resolving') return state;
    return { phase: 'solving', progress: event.progress, entry: '', wrongAt: null };
  }

  if (state.phase !== 'solving') return state;

  switch (event.type) {
    case 'digit':
      if (state.entry.length >= MAX_ENTRY) return state;
      return { ...state, entry: state.entry + String(event.digit), wrongAt: null };

    case 'backspace':
      if (state.entry === '') return state;
      return { ...state, entry: state.entry.slice(0, -1), wrongAt: null };

    case 'clear':
      if (state.entry === '') return state;
      return { ...state, entry: '', wrongAt: null };

    case 'wrong':
      return {
        phase: 'solving',
        progress: {
          ...state.progress,
          wrongCount: state.progress.wrongCount + 1,
          problem: event.problem,
          problemShownAt: event.at,
          firstAnswerAt: state.progress.firstAnswerAt ?? event.at,
        },
        entry: '',
        wrongAt: event.at,
      };

    case 'advance':
      return {
        phase: 'solving',
        progress: {
          ...state.progress,
          stepIndex: state.progress.stepIndex + 1,
          problem: event.problem,
          problemShownAt: event.at,
          firstAnswerAt: state.progress.firstAnswerAt ?? event.at,
        },
        entry: '',
        wrongAt: null,
      };

    case 'complete':
      return {
        phase: 'dismissing',
        progress: {
          ...state.progress,
          stepIndex: state.progress.stepIndex + 1,
          firstAnswerAt: state.progress.firstAnswerAt ?? event.at,
        },
      };

    default:
      return state;
  }
}

/** Whether the typed answer solves the problem on screen. */
export function isCorrect(entry: string, problem: Problem): boolean {
  if (entry === '') return false;
  return Number(entry) === problem.answer;
}

/** True while system back must be refused — the alarm is still ringing. */
export function blocksBack(state: WakeState): boolean {
  return state.phase === 'solving' || state.phase === 'dismissing' || state.phase === 'resolving';
}
