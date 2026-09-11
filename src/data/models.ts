import type { Difficulty, Problem } from '@/domain/math/types';
import type { Mood } from '@/domain/mood/types';

/**
 * The application-facing shapes, and the mappers between them and the raw
 * SQLite rows.
 *
 * SQLite has no booleans, no null-vs-undefined distinction worth relying on,
 * and no nested values, so every row crosses this boundary exactly once: rows
 * are snake_case with 0/1 flags and JSON strings, models are camelCase with
 * real booleans and real objects. Nothing above `data/` should ever see a row.
 */

// --- Alarms -----------------------------------------------------------------

export type Alarm = {
  id: string;
  hour: number;
  minute: number;
  label: string | null;
  /** Bitmask, Monday = 1 … Sunday = 64. Zero means a one-time alarm. */
  repeatDays: number;
  difficulty: Difficulty;
  enabled: boolean;
  /** Cache of the occurrence currently armed with the kernel. Derived, never authoritative. */
  nextTriggerAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type AlarmRow = {
  id: string;
  hour: number;
  minute: number;
  label: string | null;
  repeat_days: number;
  difficulty: Difficulty;
  enabled: number;
  next_trigger_at: number | null;
  created_at: number;
  updated_at: number;
};

export function toAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    hour: row.hour,
    minute: row.minute,
    label: row.label,
    repeatDays: row.repeat_days,
    difficulty: row.difficulty,
    enabled: row.enabled === 1,
    nextTriggerAt: row.next_trigger_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Wake sessions ----------------------------------------------------------

/**
 * `ringing` is the state a session is born in. It is not a terminal outcome —
 * a row still carrying it either belongs to an alarm going off right now, or
 * to one the app never got to finish, which the reconciliation sweep closes as
 * `abandoned`.
 */
export type WakeSessionOutcome =
  | 'ringing'
  | 'solved'
  | 'system_stopped'
  | 'cancelled'
  | 'abandoned';

export type WakeSession = {
  id: string;
  alarmId: string;
  /** Snapshot: history has to stay readable after its alarm is deleted or edited. */
  alarmLabel: string | null;
  difficulty: Difficulty;
  requiredProblems: number;
  firedAt: number;
  firstAnswerAt: number | null;
  dismissedAt: number | null;
  outcome: WakeSessionOutcome;
  correctCount: number;
  wrongCount: number;
  /** `dismissedAt - firstAnswerAt`: time spent solving, not time spent ringing. */
  solveMs: number | null;
  mood: Mood | null;
  alarmHour: number | null;
};

export type WakeSessionRow = {
  id: string;
  alarm_id: string;
  alarm_label: string | null;
  difficulty: Difficulty;
  required_problems: number;
  fired_at: number;
  first_answer_at: number | null;
  dismissed_at: number | null;
  outcome: WakeSessionOutcome;
  correct_count: number;
  wrong_count: number;
  solve_ms: number | null;
  mood: string | null;
  alarm_hour: number | null;
};

export function toWakeSession(row: WakeSessionRow): WakeSession {
  return {
    id: row.id,
    alarmId: row.alarm_id,
    alarmLabel: row.alarm_label,
    difficulty: row.difficulty,
    requiredProblems: row.required_problems,
    firedAt: row.fired_at,
    firstAnswerAt: row.first_answer_at,
    dismissedAt: row.dismissed_at,
    outcome: row.outcome,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    solveMs: row.solve_ms,
    mood: (row.mood as Mood | null) ?? null,
    alarmHour: row.alarm_hour ?? null,
  };
}

// --- Active challenge -------------------------------------------------------

export type ActiveChallenge = {
  sessionId: string;
  alarmId: string;
  /** How many problems are already solved; also the index of the current one. */
  stepIndex: number;
  requiredProblems: number;
  wrongCount: number;
  /**
   * The exact question on screen, stored whole. It is restored verbatim after
   * process death and never regenerated — being handed a different sum after a
   * crash would read as the app cheating.
   */
  problem: Problem;
  startedAt: number;
  firstAnswerAt: number | null;
  updatedAt: number;
};

export type ActiveChallengeRow = {
  id: number;
  session_id: string;
  alarm_id: string;
  step_index: number;
  required_problems: number;
  wrong_count: number;
  problem_json: string;
  started_at: number;
  first_answer_at: number | null;
  updated_at: number;
};

export function toActiveChallenge(row: ActiveChallengeRow): ActiveChallenge {
  return {
    sessionId: row.session_id,
    alarmId: row.alarm_id,
    stepIndex: row.step_index,
    requiredProblems: row.required_problems,
    wrongCount: row.wrong_count,
    problem: JSON.parse(row.problem_json) as Problem,
    startedAt: row.started_at,
    firstAnswerAt: row.first_answer_at,
    updatedAt: row.updated_at,
  };
}

// --- Settings ---------------------------------------------------------------

export const SettingKey = {
  defaultDifficulty: 'default_difficulty',
  onboardingCompleted: 'onboarding_completed',
} as const;

export type SettingKeyName = (typeof SettingKey)[keyof typeof SettingKey];
