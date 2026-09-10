import AlarmCore from '../../modules/alarm-core';
import type {
  AlarmDismissedPayload,
  AlarmFiredPayload,
  DismissReason,
} from '../../modules/alarm-core';

import type { WakeSessionOutcome } from '@/data/models';
import * as activeChallenge from '@/data/repositories/activeChallenge';
import * as alarmsRepo from '@/data/repositories/alarms';
import * as sessionsRepo from '@/data/repositories/sessions';
import * as settingsRepo from '@/data/repositories/settings';
import { REQUIRED_PROBLEMS, generateProblem } from '@/domain/math/engine';
import type { Problem } from '@/domain/math/types';
import type { WakeProgress } from '@/features/wake/machine';

import { rescheduleAfterDismissal } from './alarm-scheduler';

/**
 * The lifecycle of one ringing alarm, from "what is going off right now" to a
 * closed session and a re-armed schedule.
 *
 * All of it is written so that any single step can be the last one before the
 * process dies, and the next launch can still work out what happened. Nothing
 * here holds state in memory that matters.
 */

/**
 * The id of the alarm ringing right now, or null.
 *
 * The one question every entry point asks, and the reason nothing above
 * `services/` needs to know the kernel exists.
 */
export async function ringingAlarmId(): Promise<string | null> {
  const active = await AlarmCore.getActiveAlarm();
  return active?.id ?? null;
}

/** An alarm going off while the app is already open and on screen. */
export function subscribeToAlarmFired(
  handler: (payload: AlarmFiredPayload) => void
): { remove: () => void } {
  return AlarmCore.addListener('onAlarmFired', handler);
}

/** Native tearing the alarm down on its own, for any reason. */
export function subscribeToAlarmDismissed(
  handler: (payload: AlarmDismissedPayload) => void
): { remove: () => void } {
  return AlarmCore.addListener('onAlarmDismissed', handler);
}

/**
 * Works out what the wake screen should show.
 *
 * Called on every entry to the screen, whether the app was launched cold by the
 * alarm's full-screen intent or was already open. `getActiveAlarm()` is the
 * authority — not the `onAlarmFired` event, which was broadcast before this JS
 * context existed on the cold path that matters most.
 */
export async function resolveWake(): Promise<WakeProgress | null> {
  const active = await AlarmCore.getActiveAlarm();
  if (!active) return null;

  const existing = await activeChallenge.get();

  if (existing && existing.alarmId === active.id) {
    const session = await sessionsRepo.getById(existing.sessionId);

    if (session?.outcome === 'solved') {
      // The process died between writing the solved session and telling native
      // to stop. Finish the job rather than making the user solve it twice.
      await completeDismissal(session.alarmId);
      return null;
    }

    if (session?.outcome === 'ringing') {
      return {
        sessionId: session.id,
        alarmId: session.alarmId,
        alarmLabel: session.alarmLabel,
        difficulty: session.difficulty,
        requiredProblems: existing.requiredProblems,
        stepIndex: existing.stepIndex,
        wrongCount: existing.wrongCount,
        // Restored exactly, never regenerated: being handed a different sum
        // after a crash would read as the app moving the goalposts.
        problem: existing.problem,
        problemShownAt: Date.now(),
        firedAt: session.firedAt,
        firstAnswerAt: existing.firstAnswerAt,
      };
    }
  }

  // Either there was no challenge, or it belonged to a different alarm — a
  // leftover from a ring that ended without the app running.
  if (existing) await activeChallenge.clear();

  return startChallenge(active.id, active.label ?? null, active.firedAtMs);
}

async function startChallenge(
  alarmId: string,
  nativeLabel: string | null,
  firedAt: number
): Promise<WakeProgress> {
  const alarm = await alarmsRepo.getById(alarmId);
  // An alarm deleted between firing and being answered still has to be
  // dismissable, so the difficulty falls back rather than the screen failing.
  const difficulty = alarm?.difficulty ?? (await settingsRepo.getDefaultDifficulty());
  const requiredProblems = REQUIRED_PROBLEMS[difficulty];
  const label = alarm?.label ?? nativeLabel;

  // A session may already have been opened for this exact ring — the app can
  // die after the insert and before the challenge row is written. Reusing it
  // keeps one ring to one row, which every count in Analytics depends on.
  const open = await sessionsRepo.listRinging();
  const session =
    open.find((row) => row.alarmId === alarmId && row.firedAt === firedAt) ??
    (await sessionsRepo.start({
      alarmId,
      alarmLabel: label,
      difficulty,
      requiredProblems,
      firedAt,
    }));

  const problem = generateProblem(difficulty);
  const now = Date.now();

  const progress: WakeProgress = {
    sessionId: session.id,
    alarmId,
    alarmLabel: session.alarmLabel,
    difficulty,
    requiredProblems: session.requiredProblems,
    stepIndex: 0,
    wrongCount: 0,
    problem,
    problemShownAt: now,
    firedAt: session.firedAt,
    firstAnswerAt: session.firstAnswerAt,
  };

  await saveProgress(progress);
  return progress;
}

/**
 * Writes the challenge row. Called before every render that changes the step,
 * the wrong count or the problem, so process death can lose at most the digits
 * typed since the last submit.
 */
export async function saveProgress(progress: WakeProgress): Promise<void> {
  await activeChallenge.save({
    sessionId: progress.sessionId,
    alarmId: progress.alarmId,
    stepIndex: progress.stepIndex,
    requiredProblems: progress.requiredProblems,
    wrongCount: progress.wrongCount,
    problem: progress.problem,
    startedAt: progress.firedAt,
    firstAnswerAt: progress.firstAnswerAt,
    updatedAt: Date.now(),
  });
}

export async function recordAnswer(
  progress: WakeProgress,
  input: { given: number; correct: boolean; answeredAt: number }
): Promise<void> {
  await sessionsRepo.recordAnswer(progress.sessionId, {
    problem: progress.problem,
    given: input.given,
    correct: input.correct,
    shownAt: progress.problemShownAt,
    answeredAt: input.answeredAt,
  });
}

/** The replacement problem after a wrong answer — never the same answer twice. */
export function nextProblemAfterWrong(progress: WakeProgress): Problem {
  return generateProblem(progress.difficulty, { avoidAnswer: progress.problem.answer });
}

export function nextProblem(progress: WakeProgress): Problem {
  return generateProblem(progress.difficulty);
}

/**
 * The dismissal, in the one order that leaves every crash point recoverable.
 *
 * 1. mark the session solved
 * 2. delete the challenge row
 * 3. tell native to stop
 * 4. re-arm the next occurrence, or switch a one-time alarm off
 *
 * Dying between 1 and 3 leaves a ringing alarm with a solved session, which
 * `resolveWake` recognises and finishes. The reverse order — stopping the
 * alarm first — would strand a solved wake-up as `abandoned` in the history.
 */
export async function dismissSolved(progress: WakeProgress): Promise<void> {
  await sessionsRepo.close(progress.sessionId, {
    outcome: 'solved',
    dismissedAt: Date.now(),
  });
  await completeDismissal(progress.alarmId);
}

/** Steps 2 to 4, shared by a fresh dismissal and by the crash-recovery path. */
async function completeDismissal(alarmId: string): Promise<void> {
  await activeChallenge.clear();
  // Idempotent on the native side, which is what makes the recovery path above
  // safe to run a second time.
  await AlarmCore.dismissAlarm(alarmId);
  await rescheduleAfterDismissal(alarmId);
}

/** Every outcome a session can be closed with — `ringing` is a start, not an end. */
export type ClosedSessionOutcome = Exclude<WakeSessionOutcome, 'ringing'>;

const OUTCOME_BY_REASON: Record<DismissReason, ClosedSessionOutcome> = {
  solved: 'solved',
  cancelled: 'cancelled',
  systemStopped: 'system_stopped',
};

/**
 * Closes a session that native ended on its own — the service was killed, or
 * the alarm was stopped from outside the challenge.
 *
 * The alarm is not re-armed here on purpose: reconciliation on the next
 * foreground does that, and doing it from an event that can arrive more than
 * once would arm the same occurrence twice.
 */
export async function closeFromNative(
  sessionId: string,
  reason: DismissReason
): Promise<ClosedSessionOutcome> {
  const outcome = OUTCOME_BY_REASON[reason] ?? 'system_stopped';
  await sessionsRepo.close(sessionId, { outcome, dismissedAt: Date.now() });
  await activeChallenge.clear();
  return outcome;
}

/**
 * The development-only abort. Behind `__DEV__` at every call site, and again
 * here, so no build can ship a way out of a challenge that is not solving it.
 */
export async function abortForDevelopment(progress: WakeProgress): Promise<boolean> {
  if (!__DEV__) return false;
  await sessionsRepo.close(progress.sessionId, {
    outcome: 'cancelled',
    dismissedAt: Date.now(),
  });
  await completeDismissal(progress.alarmId);
  return true;
}
