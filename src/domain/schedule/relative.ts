/**
 * The calendar arithmetic behind "Tomorrow, in 7h 24m".
 *
 * It lives in `domain/` rather than next to the strings it feeds because it is
 * the part that can be wrong: counting days by dividing milliseconds is off by
 * one on every DST boundary, and "in 0m" for an alarm that has not fired yet
 * reads as a stuck clock. Both are tested here; the wording is not.
 */

/**
 * Whole local calendar days from one instant to another — 0 for today, 1 for
 * tomorrow, and negative for the past.
 *
 * Compared at midnight rather than by elapsed time, so 23:59 to 00:01 is one
 * day and a 23-hour DST day is still one day.
 */
export function localDayOffset(from: number, to: number): number {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  // Divided then rounded: the interval between two local midnights is 23, 24 or
  // 25 hours depending on DST, and rounding absorbs that.
  return Math.round((end - start) / 86_400_000);
}

/** Local midnight at the start of the day containing `at`. */
export function startOfLocalDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export type Duration = {
  days: number;
  hours: number;
  minutes: number;
  /**
   * True once the target has arrived or passed — the point at which a
   * countdown should read "now" rather than a number. Anything still ahead
   * rounds up to at least one minute.
   */
  imminent: boolean;
};

/**
 * A remaining interval, broken into days, hours and minutes.
 *
 * Rounded *up* to the whole minute: an alarm 90 seconds out reads "2m" then
 * "1m" then "now", where rounding down would show "1m" for two minutes and
 * then sit on "0m".
 */
export function remaining(fromMs: number, toMs: number): Duration {
  const minutes = Math.ceil((toMs - fromMs) / 60_000);

  if (minutes < 1) return { days: 0, hours: 0, minutes: 0, imminent: true };

  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
    imminent: false,
  };
}
