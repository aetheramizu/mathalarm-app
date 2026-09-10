import type { Difficulty, Problem } from '@/domain/math/types';

import { getDb } from '../db';
import { newId } from '../ids';
import {
  toWakeSession,
  type WakeSession,
  type WakeSessionOutcome,
  type WakeSessionRow,
} from '../models';

export type SessionStart = {
  alarmId: string;
  alarmLabel: string | null;
  difficulty: Difficulty;
  requiredProblems: number;
  firedAt: number;
};

export type AnswerRecord = {
  problem: Problem;
  /** What the user typed. Null when the attempt was abandoned rather than answered. */
  given: number | null;
  correct: boolean;
  shownAt: number;
  answeredAt: number;
};

const SELECT = `
  SELECT id, alarm_id, alarm_label, difficulty, required_problems, fired_at,
         first_answer_at, dismissed_at, outcome, correct_count, wrong_count, solve_ms
  FROM wake_sessions
`;

/**
 * Opens a session the moment the alarm fires, in the `ringing` state.
 *
 * Recording at fire time rather than at dismissal is what makes the history
 * honest: an alarm the system kills, or one that is never solved, still leaves
 * a row. A history written only on success would show nothing but successes.
 */
export async function start(input: SessionStart): Promise<WakeSession> {
  const db = await getDb();
  const id = newId();

  await db.runAsync(
    `INSERT INTO wake_sessions
       (id, alarm_id, alarm_label, difficulty, required_problems, fired_at, outcome)
     VALUES (?, ?, ?, ?, ?, ?, 'ringing')`,
    [id, input.alarmId, input.alarmLabel, input.difficulty, input.requiredProblems, input.firedAt]
  );

  return {
    id,
    alarmId: input.alarmId,
    alarmLabel: input.alarmLabel,
    difficulty: input.difficulty,
    requiredProblems: input.requiredProblems,
    firedAt: input.firedAt,
    firstAnswerAt: null,
    dismissedAt: null,
    outcome: 'ringing',
    correctCount: 0,
    wrongCount: 0,
    solveMs: null,
  };
}

/**
 * The single write path for an answered question. Everything that happens when
 * a user submits an answer goes through here.
 *
 * v1 keeps aggregates only, which is all §10 of the PRD needs. The signature
 * already carries the whole attempt — problem, response, and both timestamps —
 * so introducing a `question_attempts` table later is one extra INSERT inside
 * this function and no change at any call site.
 */
export async function recordAnswer(sessionId: string, attempt: AnswerRecord): Promise<void> {
  const db = await getDb();

  await db.runAsync(
    `UPDATE wake_sessions
        SET correct_count   = correct_count + ?,
            wrong_count     = wrong_count + ?,
            first_answer_at = COALESCE(first_answer_at, ?)
      WHERE id = ?`,
    [attempt.correct ? 1 : 0, attempt.correct ? 0 : 1, attempt.answeredAt, sessionId]
  );
}

export type SessionClose = {
  outcome: Exclude<WakeSessionOutcome, 'ringing'>;
  dismissedAt: number;
};

/**
 * Closes a session. `solve_ms` measures engagement — from the first answer to
 * the last — not how long the alarm rang; a session that was never answered
 * has no solve time rather than a misleading zero.
 */
export async function close(sessionId: string, input: SessionClose): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE wake_sessions
        SET outcome      = ?,
            dismissed_at = ?,
            solve_ms     = CASE WHEN first_answer_at IS NULL THEN NULL
                                ELSE ? - first_answer_at END
      WHERE id = ?`,
    [input.outcome, input.dismissedAt, input.dismissedAt, sessionId]
  );
}

export async function getById(id: string): Promise<WakeSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<WakeSessionRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? toWakeSession(row) : null;
}

/** Sessions still marked `ringing`. Input to the reconciliation sweep. */
export async function listRinging(): Promise<WakeSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WakeSessionRow>(
    `${SELECT} WHERE outcome = 'ringing' ORDER BY fired_at ASC`
  );
  return rows.map(toWakeSession);
}

/** Closed sessions that fired at or after `since`. The only input Analytics gets. */
export async function listSince(since: number): Promise<WakeSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WakeSessionRow>(
    `${SELECT} WHERE fired_at >= ? AND outcome != 'ringing' ORDER BY fired_at DESC`,
    [since]
  );
  return rows.map(toWakeSession);
}

export async function listRecent(limit: number): Promise<WakeSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WakeSessionRow>(
    `${SELECT} WHERE outcome != 'ringing' ORDER BY fired_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toWakeSession);
}
