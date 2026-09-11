import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 002: Add mood check-in and alarm_hour snapshot to wake_sessions.
 *
 * - mood: nullable string ('happy' | 'sad' | 'angry' | 'excited')
 * - alarm_hour: nullable integer (0-23) snapshotting the alarm's configured hour
 */
export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE wake_sessions ADD COLUMN mood TEXT;
    ALTER TABLE wake_sessions ADD COLUMN alarm_hour INTEGER;
  `);
}
