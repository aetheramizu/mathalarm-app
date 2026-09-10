import { getDb } from '../db';
import { toActiveChallenge, type ActiveChallenge, type ActiveChallengeRow } from '../models';

/**
 * The durable record of the challenge in flight.
 *
 * The wake screen writes here before it renders, every time the step, the wrong
 * count or the problem changes. If Android kills the app while the alarm is
 * still ringing, this row is what the relaunched screen resumes from — the same
 * step, and the same question, restored exactly rather than generated again.
 */

export async function get(): Promise<ActiveChallenge | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ActiveChallengeRow>(
    'SELECT * FROM active_challenge WHERE id = 1'
  );
  return row ? toActiveChallenge(row) : null;
}

/**
 * Writes the current state, replacing whatever was there.
 *
 * One row, always id 1: exactly one alarm can be ringing, so exactly one
 * challenge can be in flight. `INSERT OR REPLACE` makes the save idempotent, so
 * a caller never has to know whether this is the first write or the twentieth.
 */
export async function save(challenge: ActiveChallenge): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO active_challenge
       (id, session_id, alarm_id, step_index, required_problems, wrong_count,
        problem_json, started_at, first_answer_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      challenge.sessionId,
      challenge.alarmId,
      challenge.stepIndex,
      challenge.requiredProblems,
      challenge.wrongCount,
      JSON.stringify(challenge.problem),
      challenge.startedAt,
      challenge.firstAnswerAt,
      Date.now(),
    ]
  );
}

export async function clear(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM active_challenge');
}
