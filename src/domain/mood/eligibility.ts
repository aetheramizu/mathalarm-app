/**
 * Whether the alarm's configured hour falls within the morning window.
 * This is one of two conditions for showing the check-in — the other is
 * that no earlier solved morning-window session exists on the same local day.
 *
 * Window: 04:00 (inclusive) to 14:00 (exclusive).
 * Uses the alarm's configured hour, not fired_at or the current clock.
 */
export function isMorningAlarm(alarmHour: number): boolean {
  return alarmHour >= 4 && alarmHour < 14;
}
