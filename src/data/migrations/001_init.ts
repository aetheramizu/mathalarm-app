import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The v1 schema.
 *
 * Two shapes here carry real design weight and should not be "tidied" later
 * without reading `ARCHITECTURE.md` §3 first:
 *
 * - `wake_sessions` has no foreign key to `alarms`. History outlives the alarm
 *   that produced it, and the label and difficulty are snapshotted for the same
 *   reason.
 * - `active_challenge` is capped at a single row by a CHECK on its primary key.
 *   Exactly one challenge can be in flight, because exactly one alarm can be
 *   ringing.
 */
export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE alarms (
      id              TEXT    PRIMARY KEY NOT NULL,
      hour            INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
      minute          INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
      label           TEXT,
      repeat_days     INTEGER NOT NULL DEFAULT 0 CHECK (repeat_days BETWEEN 0 AND 127),
      difficulty      TEXT    NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
      enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      next_trigger_at INTEGER,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE INDEX idx_alarms_enabled_next ON alarms (enabled, next_trigger_at);

    CREATE TABLE wake_sessions (
      id                TEXT    PRIMARY KEY NOT NULL,
      alarm_id          TEXT    NOT NULL,
      alarm_label       TEXT,
      difficulty        TEXT    NOT NULL,
      required_problems INTEGER NOT NULL,
      fired_at          INTEGER NOT NULL,
      first_answer_at   INTEGER,
      dismissed_at      INTEGER,
      outcome           TEXT    NOT NULL DEFAULT 'ringing'
                        CHECK (outcome IN ('ringing','solved','system_stopped','cancelled','abandoned')),
      correct_count     INTEGER NOT NULL DEFAULT 0,
      wrong_count       INTEGER NOT NULL DEFAULT 0,
      solve_ms          INTEGER
    );

    CREATE INDEX idx_sessions_fired_at ON wake_sessions (fired_at DESC);

    CREATE TABLE active_challenge (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      session_id        TEXT    NOT NULL,
      alarm_id          TEXT    NOT NULL,
      step_index        INTEGER NOT NULL,
      required_problems INTEGER NOT NULL,
      wrong_count       INTEGER NOT NULL,
      problem_json      TEXT    NOT NULL,
      started_at        INTEGER NOT NULL,
      first_answer_at   INTEGER,
      updated_at        INTEGER NOT NULL
    );

    CREATE TABLE settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    INSERT INTO settings (key, value) VALUES
      ('default_difficulty', 'medium'),
      ('onboarding_completed', 'false');
  `);
}
