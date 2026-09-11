import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { up as migration001 } from './migrations/001_init';
import { up as migration002 } from './migrations/002_add_mood';

const DATABASE_NAME = 'mathalarm.db';

/**
 * Ordered, append-only. A migration's position in this array is its version, so
 * entries are never reordered, edited after shipping, or removed — a released
 * database has already run them.
 */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  migration001,
  migration002,
];

let connection: Promise<SQLiteDatabase> | null = null;

/**
 * The one way to reach the database.
 *
 * The promise is cached rather than the resolved handle, so concurrent callers
 * during startup — and there are several, since reconciliation, the alarm list
 * and a possible ringing alarm all wake at once — share a single open and a
 * single migration run instead of racing.
 */
export function getDb(): Promise<SQLiteDatabase> {
  if (!connection) {
    connection = open().catch((error) => {
      // A failed open must not be cached, or the app is stuck with a poisoned
      // promise until it is killed.
      connection = null;
      throw error;
    });
  }
  return connection;
}

async function open(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  // WAL keeps a read during the wake screen from blocking on a write.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version];
    const next = version + 1;

    await db.withTransactionAsync(async () => {
      await migration(db);
      // PRAGMA cannot be parameterised, so the value is interpolated. It comes
      // from this array's length, never from input.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });

    version = next;
  }
}
