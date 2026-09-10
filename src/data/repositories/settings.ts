import type { Difficulty } from '@/domain/math/types';

import { getDb } from '../db';
import { SettingKey, type SettingKeyName } from '../models';

/**
 * Small, typed key–value storage. App preferences only — never alarm state,
 * which belongs in its own table.
 */

export async function get(key: SettingKeyName): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function set(key: SettingKeyName, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * The difficulty a **new** alarm starts at.
 *
 * It is inherited once, at creation. Each alarm then owns its own difficulty
 * and that stored value is what runs when it fires, so changing this default
 * never rewrites an alarm that already exists.
 */
export async function getDefaultDifficulty(): Promise<Difficulty> {
  const stored = await get(SettingKey.defaultDifficulty);
  // Falling back rather than trusting the column: the row could have been
  // written by an older build, and an unknown difficulty would break the
  // problem generator at 6am.
  return DIFFICULTIES.includes(stored as Difficulty) ? (stored as Difficulty) : 'medium';
}

export async function setDefaultDifficulty(difficulty: Difficulty): Promise<void> {
  await set(SettingKey.defaultDifficulty, difficulty);
}

export async function isOnboardingCompleted(): Promise<boolean> {
  return (await get(SettingKey.onboardingCompleted)) === 'true';
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  await set(SettingKey.onboardingCompleted, completed ? 'true' : 'false');
}
