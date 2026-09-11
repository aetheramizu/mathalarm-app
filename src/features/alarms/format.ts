import type { Alarm } from '@/data/models';
import { WEEKDAY_BITS } from '@/domain/schedule/occurrence';
import { localDayOffset, remaining } from '@/domain/schedule/relative';

/**
 * Turning alarm rows into the strings the list reads out.
 *
 * Wording only — the calendar arithmetic underneath lives in
 * `domain/schedule/relative.ts`, where it is tested.
 *
 * MathAlarm reads one clock everywhere, and it is the twelve-hour one the time
 * wheels are set with. It used to be twenty-four everywhere for exactly the
 * same reason: a picker that takes `06:30` and a list that says `6:30 AM` are
 * two clocks to reconcile at 3am, and there is no version of that worth having.
 * Only the display changed — `alarms.hour` is still 0–23 in the database, in
 * the scheduler and in every calculation, because that is the representation
 * where "which of these two times is first" has one answer.
 */

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const WEEKDAY_MASK = 0b0011111;
const WEEKEND_MASK = 0b1100000;
const EVERY_DAY_MASK = 0b1111111;

/** The seven buttons of the repeat picker, Monday first. */
export const DAY_PICKER = WEEKDAY_BITS.map((bit, index) => ({
  bit,
  initial: DAY_INITIALS[index],
  name: DAY_FULL[index],
}));

/**
 * The clock face, split so it can be typeset the way a clock is.
 *
 * The meridiem is deliberately not part of the digits: on the cards the digits
 * are 40 to 48 point and `AM` at that size is a third of the width of the row
 * for two letters that never change. Returned separately, it can sit small
 * beside them — and the digits stay monospaced and column-aligned down the
 * list, which was the one real virtue of the twenty-four hour display.
 */
export function splitClock(hour: number, minute: number): { time: string; meridiem: string } {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return {
    time: `${hour12}:${String(minute).padStart(2, '0')}`,
    meridiem: hour >= 12 ? 'PM' : 'AM',
  };
}

/** The same clock as one string, for accessibility labels and prose. */
export function formatTime(hour: number, minute: number): string {
  const { time, meridiem } = splitClock(hour, minute);
  return `${time} ${meridiem}`;
}

/** "Every day", "Weekdays", "Mon, Wed, Fri", or "Once" for a one-time alarm. */
export function formatRepeat(repeatDays: number): string {
  if (repeatDays === 0) return 'Once';
  if (repeatDays === EVERY_DAY_MASK) return 'Every day';
  if (repeatDays === WEEKDAY_MASK) return 'Weekdays';
  if (repeatDays === WEEKEND_MASK) return 'Weekends';

  return WEEKDAY_BITS.map((bit, index) => (repeatDays & bit ? DAY_SHORT[index] : null))
    .filter((day) => day !== null)
    .join(', ');
}

/**
 * The countdown with the preposition stripped off, for when "RINGS IN" is
 * already written above it in its own label and the number is the thing being
 * set large.
 */
export function formatCountdownValue(triggerAt: number, now: number): string {
  const countdown = formatCountdown(triggerAt, now);
  return countdown.startsWith('in ') ? countdown.slice(3) : countdown;
}

export function formatCountdown(triggerAt: number, now: number): string {
  const { days, hours, minutes, imminent } = remaining(now, triggerAt);
  if (imminent) return 'now';
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

/** "Today", "Tomorrow", or a weekday name — the calendar half of the countdown. */
export function formatWhen(triggerAt: number, now: number): string {
  const offset = localDayOffset(now, triggerAt);
  if (offset <= 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset < 7) return DAY_FULL[(new Date(triggerAt).getDay() + 6) % 7];
  return new Date(triggerAt).toLocaleDateString();
}

/**
 * The one-line summary under an alarm's time.
 *
 * An alarm that is enabled but has no armed occurrence says so plainly. That
 * state is real — a revoked exact-alarm permission produces it — and showing
 * the intended time instead would promise a ring that is not going to happen.
 */
export function describeAlarm(alarm: Alarm, now: number): string {
  const repeat = formatRepeat(alarm.repeatDays);
  if (!alarm.enabled) return `${repeat} · Off`;
  if (alarm.nextTriggerAt === null) return `${repeat} · Not scheduled`;
  return `${repeat} · ${formatWhen(alarm.nextTriggerAt, now)} ${formatCountdown(
    alarm.nextTriggerAt,
    now
  )}`;
}
