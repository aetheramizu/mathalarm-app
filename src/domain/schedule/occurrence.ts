/**
 * Turning an alarm's wall-clock time and repeat mask into the next absolute
 * moment it should fire.
 *
 * Pure and dependency-free, like the rest of `domain/`, so every rollover case
 * — midnight, month end, DST, a repeat day that is today but already past —
 * can be tested on the host rather than by waiting for 6am.
 *
 * Alarms store wall-clock fields rather than a timestamp, and this is where
 * that pays off: "06:30" is recomputed against the current local calendar every
 * time, so it stays 06:30 after a timezone change or a DST shift instead of
 * drifting by an hour.
 */

/** Bitmask values. Monday is bit 0 because the week starts on Monday in the UI. */
export const Weekday = {
  monday: 1,
  tuesday: 2,
  wednesday: 4,
  thursday: 8,
  friday: 16,
  saturday: 32,
  sunday: 64,
} as const;

/** Every day set. Also the maximum legal value of `repeat_days`. */
export const ALL_DAYS = 127;

/** Monday-first order, which is how the repeat picker reads. */
export const WEEKDAY_BITS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];

export type OccurrenceInput = {
  hour: number;
  minute: number;
  /** Bitmask, Monday = 1 … Sunday = 64. Zero means a one-time alarm. */
  repeatDays: number;
};

/**
 * `Date.getDay()` counts from Sunday; the mask counts from Monday, so the two
 * need translating rather than indexing directly.
 */
export function weekdayBit(date: Date): number {
  return WEEKDAY_BITS[(date.getDay() + 6) % 7];
}

export function repeatsOn(repeatDays: number, date: Date): boolean {
  return (repeatDays & weekdayBit(date)) !== 0;
}

/**
 * The next moment this alarm should fire, as ms since epoch, or `null` if there
 * is none.
 *
 * Strictly *after* `from`: an alarm whose time is exactly now belongs to the
 * next occurrence, not to this instant, or re-arming at the moment of dismissal
 * would immediately re-fire the alarm that was just solved.
 */
export function nextOccurrence(alarm: OccurrenceInput, from: Date): number | null {
  // A one-time alarm is simply "the next time that clock reading comes round",
  // today or tomorrow.
  if (alarm.repeatDays === 0) {
    const today = atLocalTime(from, 0, alarm.hour, alarm.minute);
    return today > from.getTime() ? today : atLocalTime(from, 1, alarm.hour, alarm.minute);
  }

  // Eight days, not seven: today may already be past its time, so the same
  // weekday a week later has to stay reachable.
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(atLocalTime(from, offset, alarm.hour, alarm.minute));
    if (candidate.getTime() > from.getTime() && repeatsOn(alarm.repeatDays, candidate)) {
      return candidate.getTime();
    }
  }

  // Unreachable for any mask in 1…127, and deliberately not thrown: a corrupt
  // mask should leave an alarm visibly unarmed rather than crash the scheduler.
  return null;
}

/**
 * `from`'s local calendar date plus `dayOffset` days, at the given wall-clock
 * time.
 *
 * Built from local calendar fields rather than by adding milliseconds, which is
 * what makes it DST-correct: the day after a spring-forward is 23 hours later,
 * not 24, and the platform resolves the hour that does not exist by rolling
 * forward — the right answer for an alarm, which should still go off that
 * morning.
 */
function atLocalTime(from: Date, dayOffset: number, hour: number, minute: number): number {
  return new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + dayOffset,
    hour,
    minute,
    0,
    0
  ).getTime();
}
