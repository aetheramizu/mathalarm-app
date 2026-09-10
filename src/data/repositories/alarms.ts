import type { Difficulty } from '@/domain/math/types';

import { getDb } from '../db';
import { newId } from '../ids';
import { toAlarm, type Alarm, type AlarmRow } from '../models';

export type NewAlarm = {
  hour: number;
  minute: number;
  label: string | null;
  /** Bitmask, Monday = 1 … Sunday = 64. Zero means one-time. */
  repeatDays: number;
  difficulty: Difficulty;
};

/** Everything a user can change after the fact. */
export type AlarmPatch = Partial<NewAlarm & { enabled: boolean }>;

const SELECT = `
  SELECT id, hour, minute, label, repeat_days, difficulty, enabled,
         next_trigger_at, created_at, updated_at
  FROM alarms
`;

/**
 * Ordered the way the list screen reads them: soonest first, alarms with no
 * armed occurrence last, and a stable clock-time tiebreak so the list never
 * reshuffles between renders.
 */
const ORDER = `
  ORDER BY (next_trigger_at IS NULL), next_trigger_at ASC, hour ASC, minute ASC
`;

export async function listAll(): Promise<Alarm[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AlarmRow>(`${SELECT} ${ORDER}`);
  return rows.map(toAlarm);
}

export async function listEnabled(): Promise<Alarm[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AlarmRow>(`${SELECT} WHERE enabled = 1 ${ORDER}`);
  return rows.map(toAlarm);
}

export async function getById(id: string): Promise<Alarm | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AlarmRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? toAlarm(row) : null;
}

export async function create(input: NewAlarm): Promise<Alarm> {
  const db = await getDb();
  const now = Date.now();
  const id = newId();

  await db.runAsync(
    `INSERT INTO alarms
       (id, hour, minute, label, repeat_days, difficulty, enabled, next_trigger_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
    [id, input.hour, input.minute, input.label, input.repeatDays, input.difficulty, now, now]
  );

  // `next_trigger_at` stays null until the scheduler arms it. An alarm that is
  // enabled but unarmed is exactly the unhealthy state the list has to surface,
  // so it must not be faked here.
  return {
    id,
    hour: input.hour,
    minute: input.minute,
    label: input.label,
    repeatDays: input.repeatDays,
    difficulty: input.difficulty,
    enabled: true,
    nextTriggerAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Column names are taken from this fixed map, never from caller input. */
const PATCH_COLUMNS: Record<keyof AlarmPatch, string> = {
  hour: 'hour',
  minute: 'minute',
  label: 'label',
  repeatDays: 'repeat_days',
  difficulty: 'difficulty',
  enabled: 'enabled',
};

export async function update(id: string, patch: AlarmPatch): Promise<void> {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  for (const key of Object.keys(patch) as (keyof AlarmPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    assignments.push(`${PATCH_COLUMNS[key]} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }

  if (assignments.length === 0) return;

  const db = await getDb();
  await db.runAsync(`UPDATE alarms SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...values,
    Date.now(),
    id,
  ]);
}

export async function setEnabled(id: string, enabled: boolean): Promise<void> {
  await update(id, { enabled });
}

/**
 * Records which occurrence is currently armed with the kernel.
 *
 * Separate from `update` on purpose: this is the scheduler writing back a
 * derived value, not the user editing an alarm, and it deliberately does not
 * touch `updated_at`.
 */
export async function setNextTriggerAt(id: string, nextTriggerAt: number | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE alarms SET next_trigger_at = ? WHERE id = ?', [nextTriggerAt, id]);
}

export async function remove(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM alarms WHERE id = ?', [id]);
}
