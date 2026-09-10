import AlarmCore from '../../modules/alarm-core';

import * as activeChallenge from '@/data/repositories/activeChallenge';
import * as alarmsRepo from '@/data/repositories/alarms';
import type { AlarmPatch, NewAlarm } from '@/data/repositories/alarms';
import * as sessionsRepo from '@/data/repositories/sessions';
import type { Alarm } from '@/data/models';
import { nextOccurrence } from '@/domain/schedule/occurrence';

/**
 * The bridge between the alarm rows in SQLite and the native kernel.
 *
 * Everything above this file talks about alarms; only this file knows that a
 * kernel exists. The division of labour is deliberate and narrow: SQLite is the
 * source of truth for what alarms are, the kernel is told exactly one absolute
 * occurrence at a time, and nothing about repeat rules, difficulty or math ever
 * crosses over.
 *
 * The invariant this module exists to keep is: **an enabled alarm has a
 * `next_trigger_at` if and only if that exact occurrence is armed with the
 * kernel.** A row claiming an occurrence the kernel does not hold would show
 * the user a healthy alarm that will never ring, which is the worst failure
 * this app has.
 */

/** How long after firing a `ringing` session may still legitimately be open. */
const RINGING_GRACE_MS = 30_000;

// --- Arming -----------------------------------------------------------------

/**
 * Computes this alarm's next occurrence, arms it with the kernel, and records
 * it on the row.
 *
 * The row is only updated once the kernel has accepted the schedule. If the
 * call throws — a revoked exact-alarm permission is the realistic cause —
 * `next_trigger_at` is cleared instead, so the alarm shows as unarmed rather
 * than lying about a time it will not ring at.
 */
export async function armAlarm(alarm: Alarm, now = new Date()): Promise<number | null> {
  const triggerAt = nextOccurrence(alarm, now);

  if (triggerAt === null) {
    await disarmAlarm(alarm.id);
    return null;
  }

  try {
    await AlarmCore.scheduleAlarm({
      id: alarm.id,
      triggerAtMs: triggerAt,
      label: alarm.label ?? undefined,
    });
  } catch (error) {
    await alarmsRepo.setNextTriggerAt(alarm.id, null);
    throw error;
  }

  await alarmsRepo.setNextTriggerAt(alarm.id, triggerAt);
  return triggerAt;
}

/** Cancels any armed occurrence and clears the cached trigger time. */
export async function disarmAlarm(id: string): Promise<void> {
  await cancel(id);
  await alarmsRepo.setNextTriggerAt(id, null);
}

/**
 * Cancelling never throws upwards.
 *
 * A failed cancel leaves the kernel holding an occurrence the database no
 * longer claims, which is precisely the orphan reconciliation sweeps up on the
 * next pass. Letting it propagate would instead abort whatever the user was
 * doing — disabling an alarm, or deleting one.
 */
async function cancel(id: string): Promise<void> {
  try {
    await AlarmCore.cancelAlarm(id);
  } catch (error) {
    console.warn(`[alarm-scheduler] could not cancel ${id}`, error);
  }
}

// --- Mutations --------------------------------------------------------------
//
// Every write to an alarm goes through here rather than through the repository
// directly, because every write changes what should be armed. A screen that
// called the repository alone would leave the kernel holding a stale occurrence.

export async function createAlarm(input: NewAlarm): Promise<Alarm> {
  const alarm = await alarmsRepo.create(input);
  await tryArm(alarm);
  return (await alarmsRepo.getById(alarm.id)) ?? alarm;
}

export async function updateAlarm(id: string, patch: AlarmPatch): Promise<void> {
  await alarmsRepo.update(id, patch);
  const alarm = await alarmsRepo.getById(id);
  if (!alarm) return;
  if (alarm.enabled) await tryArm(alarm);
  else await disarmAlarm(id);
}

/**
 * Arms an alarm without letting a kernel failure undo the user's edit.
 *
 * A revoked exact-alarm permission is the realistic cause, and it must not look
 * like the save failed: the alarm is real and stored, it simply has no armed
 * occurrence. `armAlarm` has already cleared `next_trigger_at`, which is
 * exactly what the list renders as "Not scheduled", and the permission banner
 * above it says why.
 */
async function tryArm(alarm: Alarm, now?: Date): Promise<void> {
  try {
    await armAlarm(alarm, now ?? new Date());
  } catch (error) {
    console.warn(`[alarm-scheduler] saved ${alarm.id} but could not arm it`, error);
  }
}

export async function setAlarmEnabled(id: string, enabled: boolean): Promise<void> {
  await updateAlarm(id, { enabled });
}

export async function deleteAlarm(id: string): Promise<void> {
  // Cancelled first: a deleted row can no longer be found by reconciliation, so
  // an occurrence left armed here would ring with nothing behind it until the
  // next sweep of orphaned ids picks it up.
  await cancel(id);
  await alarmsRepo.remove(id);
}

/**
 * The post-dismissal step, and the one moment a repeating alarm's next
 * occurrence is armed.
 *
 * Rescheduling here rather than at fire time is deliberate: this is the single
 * point where the app is guaranteed to be running with a JS context alive.
 */
export async function rescheduleAfterDismissal(alarmId: string): Promise<void> {
  const alarm = await alarmsRepo.getById(alarmId);
  if (!alarm) return;

  if (alarm.repeatDays === 0) {
    // A one-time alarm has done its job. It stays in the list, switched off,
    // rather than disappearing out from under the user.
    await alarmsRepo.setEnabled(alarmId, false);
    await disarmAlarm(alarmId);
    return;
  }

  await armAlarm(alarm);
}

// --- Reconciliation ---------------------------------------------------------

let running: Promise<void> | null = null;

/**
 * Brings the kernel back in line with the database.
 *
 * Runs on cold start, on every return to the foreground, and after anything
 * that could have changed either side. It is idempotent and cheap, so running
 * it more often than strictly necessary is the intended trade — the failure it
 * prevents is an alarm that silently never rings.
 *
 * Single-flight: a foreground event and a native event can arrive together, and
 * two passes racing could cancel an id the other had just armed.
 */
export function reconcile(): Promise<void> {
  if (!running) {
    running = runReconcile().finally(() => {
      running = null;
    });
  }
  return running;
}

async function runReconcile(): Promise<void> {
  const now = new Date();
  const [scheduledIds, alarms] = await Promise.all([
    AlarmCore.getScheduledAlarmIds(),
    alarmsRepo.listAll(),
  ]);
  const scheduled = new Set(scheduledIds);

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;

    const expected = nextOccurrence(alarm, now);
    const armed = scheduled.has(alarm.id) && alarm.nextTriggerAt === expected;
    // An armed occurrence that is already in the past is stale by definition —
    // the device was probably off when it came round — and `expected` will have
    // moved on, so the comparison above already catches it.
    if (armed) continue;

    // One alarm failing to arm must not abandon the rest of the pass; the row
    // is left with a null trigger time, which the list renders as unarmed.
    // The pass's own `now` is reused so the armed occurrence is the one the
    // comparison above expected, even if the clock has ticked past a minute.
    await tryArm(alarm, now);
  }

  // Anything the kernel holds that no enabled alarm claims: a deleted alarm, a
  // disabled one, or a leftover from an older build.
  const claimed = new Set(alarms.filter((alarm) => alarm.enabled).map((alarm) => alarm.id));
  for (const id of scheduled) {
    if (!claimed.has(id)) await cancel(id);
  }

  await sweepStaleSessions(now.getTime());
}

/**
 * Closes out sessions left open by a ring the app never finished.
 *
 * A session is opened at fire time so history stays honest, which means a ring
 * the system killed, or one the user slept through, leaves a `ringing` row
 * behind. Nothing else will ever close it, and Analytics excludes `ringing`
 * rows, so without this sweep those wake-ups would vanish from the record.
 *
 * The grace period keeps the sweep from racing a ring that has only just
 * started but has not yet registered as active.
 */
async function sweepStaleSessions(now: number): Promise<void> {
  const open = await sessionsRepo.listRinging();
  if (open.length === 0) {
    // Still worth clearing a challenge row orphaned by a reboot mid-challenge.
    const orphan = await activeChallenge.get();
    if (orphan && (await AlarmCore.getActiveAlarm()) === null) await activeChallenge.clear();
    return;
  }

  const active = await AlarmCore.getActiveAlarm();
  const challenge = await activeChallenge.get();

  for (const session of open) {
    if (active?.id === session.alarmId) continue;
    if (now - session.firedAt < RINGING_GRACE_MS) continue;

    // A session with a challenge row behind it was being solved when it
    // stopped, so the system took it away; one with no challenge row was never
    // engaged with at all. The distinction is the difference between "it was
    // killed" and "they slept through it", and Analytics reports them apart.
    const wasBeingSolved = challenge?.sessionId === session.id;
    await sessionsRepo.close(session.id, {
      outcome: wasBeingSolved ? 'system_stopped' : 'abandoned',
      dismissedAt: now,
    });
  }

  if (challenge && active?.id !== challenge.alarmId) await activeChallenge.clear();
}
