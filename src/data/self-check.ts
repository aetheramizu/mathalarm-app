import type { Problem } from '@/domain/math/types';

import { getDb } from './db';
import * as activeChallenge from './repositories/activeChallenge';
import * as alarms from './repositories/alarms';
import * as sessions from './repositories/sessions';
import * as settings from './repositories/settings';

export type SelfCheckResult = {
  ok: boolean;
  steps: { name: string; ok: boolean; detail?: string }[];
};

/**
 * A development-only round trip through every repository method.
 *
 * The repositories can only be exercised on a device — `expo-sqlite` is native,
 * so there is no meaningful way to unit-test them on the host. This stands in:
 * it writes, reads back, and deletes its own rows, and touches no real data.
 * Deleted along with the rest of the dev scaffolding once P4 and P5 exercise
 * these paths for real.
 */
export async function runDataSelfCheck(): Promise<SelfCheckResult> {
  // Metro does not tree-shake, so this module is still linked into a release
  // bundle even though nothing there renders the button that calls it. The
  // caller is already behind `__DEV__`; this second guard is what guarantees
  // that a release build can never write test rows into a real user's
  // database, whatever reaches it.
  if (!__DEV__) {
    return { ok: false, steps: [{ name: 'refused: not a development build', ok: false }] };
  }

  const steps: SelfCheckResult['steps'] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    steps.push({ name, ok, detail });
  };

  let alarmId: string | null = null;
  let sessionId: string | null = null;

  try {
    // --- alarms ------------------------------------------------------------
    const created = await alarms.create({
      hour: 6,
      minute: 30,
      label: 'self-check',
      repeatDays: 0b0011111,
      difficulty: 'medium',
    });
    alarmId = created.id;
    check('alarms.create', created.enabled && created.nextTriggerAt === null);

    const fetched = await alarms.getById(created.id);
    check(
      'alarms.getById round-trip',
      fetched?.hour === 6 &&
        fetched?.minute === 30 &&
        fetched?.repeatDays === 0b0011111 &&
        fetched?.label === 'self-check' &&
        fetched?.enabled === true
    );

    await alarms.update(created.id, { minute: 45, difficulty: 'hard' });
    const updated = await alarms.getById(created.id);
    check('alarms.update', updated?.minute === 45 && updated?.difficulty === 'hard');

    await alarms.setEnabled(created.id, false);
    check('alarms.setEnabled', (await alarms.getById(created.id))?.enabled === false);

    await alarms.setNextTriggerAt(created.id, 1234567890);
    check(
      'alarms.setNextTriggerAt',
      (await alarms.getById(created.id))?.nextTriggerAt === 1234567890
    );

    const enabledIds = (await alarms.listEnabled()).map((a) => a.id);
    check('alarms.listEnabled excludes disabled', !enabledIds.includes(created.id));
    check(
      'alarms.listAll includes disabled',
      (await alarms.listAll()).some((a) => a.id === created.id)
    );

    // --- sessions ----------------------------------------------------------
    const firedAt = Date.now();
    const session = await sessions.start({
      alarmId: created.id,
      alarmLabel: 'self-check',
      difficulty: 'medium',
      requiredProblems: 3,
      firedAt,
    });
    sessionId = session.id;
    check('sessions.start is ringing', session.outcome === 'ringing');
    check(
      'sessions.listRinging finds it',
      (await sessions.listRinging()).some((s) => s.id === session.id)
    );

    const problem: Problem = {
      id: 'p1',
      prompt: '15 + 27',
      answer: 42,
      kind: 'add',
      difficulty: 'medium',
    };
    await sessions.recordAnswer(session.id, {
      problem,
      given: 41,
      correct: false,
      shownAt: firedAt,
      answeredAt: firedAt + 4000,
    });
    await sessions.recordAnswer(session.id, {
      problem,
      given: 42,
      correct: true,
      shownAt: firedAt + 4000,
      answeredAt: firedAt + 9000,
    });
    const answered = await sessions.getById(session.id);
    check(
      'sessions.recordAnswer counts',
      answered?.correctCount === 1 && answered?.wrongCount === 1
    );
    check('sessions.recordAnswer pins first answer', answered?.firstAnswerAt === firedAt + 4000);

    await sessions.close(session.id, { outcome: 'solved', dismissedAt: firedAt + 20000 });
    const closed = await sessions.getById(session.id);
    check(
      'sessions.close computes solveMs',
      closed?.outcome === 'solved' && closed?.solveMs === 16000
    );
    check('sessions.listRinging is now empty of it', !(await sessions.listRinging()).some((s) => s.id === session.id));
    check(
      'sessions.listSince finds closed session',
      (await sessions.listSince(firedAt - 1)).some((s) => s.id === session.id)
    );

    // --- active challenge --------------------------------------------------
    await activeChallenge.save({
      sessionId: session.id,
      alarmId: created.id,
      stepIndex: 1,
      requiredProblems: 3,
      wrongCount: 1,
      problem,
      startedAt: firedAt,
      firstAnswerAt: firedAt + 4000,
      updatedAt: firedAt,
    });
    const restored = await activeChallenge.get();
    check(
      'activeChallenge restores the exact problem',
      restored?.problem.prompt === '15 + 27' &&
        restored?.problem.answer === 42 &&
        restored?.problem.id === 'p1' &&
        restored?.stepIndex === 1 &&
        restored?.wrongCount === 1
    );

    await activeChallenge.save({ ...restored!, stepIndex: 2 });
    const single = await (await getDb()).getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM active_challenge'
    );
    check('activeChallenge stays a single row', single?.n === 1);

    await activeChallenge.clear();
    check('activeChallenge.clear', (await activeChallenge.get()) === null);

    // --- settings ----------------------------------------------------------
    const originalDefault = await settings.getDefaultDifficulty();
    await settings.setDefaultDifficulty('hard');
    check('settings.default difficulty', (await settings.getDefaultDifficulty()) === 'hard');
    await settings.setDefaultDifficulty(originalDefault);

    const originalOnboarding = await settings.isOnboardingCompleted();
    await settings.setOnboardingCompleted(!originalOnboarding);
    check('settings.onboarding flag', (await settings.isOnboardingCompleted()) === !originalOnboarding);
    await settings.setOnboardingCompleted(originalOnboarding);

    // Changing the global default must not touch an existing alarm.
    const untouched = await alarms.getById(created.id);
    check('default difficulty does not rewrite alarms', untouched?.difficulty === 'hard');
  } catch (error) {
    check('unexpected failure', false, error instanceof Error ? error.message : String(error));
  } finally {
    // Leave no trace, whatever happened above.
    const db = await getDb();
    if (sessionId) await db.runAsync('DELETE FROM wake_sessions WHERE id = ?', [sessionId]);
    if (alarmId) await alarms.remove(alarmId);
    await activeChallenge.clear();
  }

  return { ok: steps.every((step) => step.ok), steps };
}
