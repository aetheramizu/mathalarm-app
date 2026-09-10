// A fixed zone, set before any Date is constructed, so the DST cases below are
// deterministic wherever the tests run. New York is chosen because its
// transitions are well known and it is not the author's own zone — a bug that
// only appears away from home is exactly what this is for.
process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Weekday, nextOccurrence, repeatsOn, weekdayBit } from './occurrence';

/** Local wall-clock construction, matching how an alarm is read. */
function local(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function readable(ms: number | null): string {
  if (ms === null) return 'null';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const MON = Weekday.monday;
const WEEKDAYS = Weekday.monday | Weekday.tuesday | Weekday.wednesday | Weekday.thursday | Weekday.friday;
const WEEKEND = Weekday.saturday | Weekday.sunday;

describe('weekdayBit', () => {
  it('maps a Sunday-based Date onto a Monday-based mask', () => {
    // 2026-09-07 is a Monday.
    assert.equal(weekdayBit(local(2026, 9, 7, 12)), Weekday.monday);
    assert.equal(weekdayBit(local(2026, 9, 11, 12)), Weekday.friday);
    assert.equal(weekdayBit(local(2026, 9, 12, 12)), Weekday.saturday);
    assert.equal(weekdayBit(local(2026, 9, 13, 12)), Weekday.sunday);
  });

  it('reports membership of a mask', () => {
    assert.ok(repeatsOn(WEEKDAYS, local(2026, 9, 11, 12)));
    assert.ok(!repeatsOn(WEEKDAYS, local(2026, 9, 12, 12)));
    assert.ok(repeatsOn(WEEKEND, local(2026, 9, 13, 12)));
  });
});

describe('nextOccurrence — one-time alarms', () => {
  const alarm = { hour: 6, minute: 30, repeatDays: 0 };

  it('fires later today when the time is still ahead', () => {
    const at = nextOccurrence(alarm, local(2026, 9, 11, 5, 0));
    assert.equal(readable(at), '2026-09-11 06:30');
  });

  it('rolls to tomorrow once the time has passed', () => {
    const at = nextOccurrence(alarm, local(2026, 9, 11, 7, 0));
    assert.equal(readable(at), '2026-09-12 06:30');
  });

  it('treats the exact minute as already gone', () => {
    // Otherwise re-arming at the instant of dismissal would immediately
    // re-fire the alarm that was just solved.
    const at = nextOccurrence(alarm, local(2026, 9, 11, 6, 30));
    assert.equal(readable(at), '2026-09-12 06:30');
  });

  it('crosses a month boundary', () => {
    const at = nextOccurrence(alarm, local(2026, 9, 30, 23, 59));
    assert.equal(readable(at), '2026-10-01 06:30');
  });

  it('crosses a year boundary', () => {
    const at = nextOccurrence(alarm, local(2026, 12, 31, 23, 59));
    assert.equal(readable(at), '2027-01-01 06:30');
  });

  it('handles a midnight alarm', () => {
    assert.equal(readable(nextOccurrence({ hour: 0, minute: 0, repeatDays: 0 }, local(2026, 9, 11, 23, 30))), '2026-09-12 00:00');
    assert.equal(readable(nextOccurrence({ hour: 0, minute: 0, repeatDays: 0 }, local(2026, 9, 11, 0, 30))), '2026-09-12 00:00');
  });
});

describe('nextOccurrence — repeating alarms', () => {
  it('fires today when today is a repeat day and the time is ahead', () => {
    // Friday 2026-09-11.
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: WEEKDAYS }, local(2026, 9, 11, 5, 0));
    assert.equal(readable(at), '2026-09-11 06:30');
  });

  it('skips to the next repeat day when today has already passed', () => {
    // Friday evening on a weekdays-only alarm → Monday.
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: WEEKDAYS }, local(2026, 9, 11, 22, 0));
    assert.equal(readable(at), '2026-09-14 06:30');
  });

  it('skips days that are not in the mask', () => {
    // Saturday, weekdays-only → Monday.
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: WEEKDAYS }, local(2026, 9, 12, 5, 0));
    assert.equal(readable(at), '2026-09-14 06:30');
  });

  it('wraps a full week for a single-day repeat', () => {
    // Monday after the alarm time, repeating on Mondays only → next Monday.
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: MON }, local(2026, 9, 7, 9, 0));
    assert.equal(readable(at), '2026-09-14 06:30');
  });

  it('finds tomorrow for a weekend alarm on a Friday', () => {
    const at = nextOccurrence({ hour: 9, minute: 15, repeatDays: WEEKEND }, local(2026, 9, 11, 22, 0));
    assert.equal(readable(at), '2026-09-12 09:15');
  });

  it('fires every day when every day is set', () => {
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: 127 }, local(2026, 9, 11, 7, 0));
    assert.equal(readable(at), '2026-09-12 06:30');
  });

  it('returns null for an empty mask it cannot satisfy', () => {
    // Unreachable through the UI; the guard exists so a corrupt row leaves the
    // alarm visibly unarmed instead of throwing inside reconciliation.
    assert.equal(nextOccurrence({ hour: 6, minute: 30, repeatDays: 128 }, local(2026, 9, 11, 7, 0)), null);
  });
});

describe('nextOccurrence — daylight saving', () => {
  // US spring forward: 2026-03-08, 02:00 EST → 03:00 EDT.
  it('keeps the wall-clock time across spring forward', () => {
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: 127 }, local(2026, 3, 7, 7, 0));
    assert.equal(readable(at), '2026-03-08 06:30');
  });

  it('lands an hour less than the clock suggests across spring forward', () => {
    const from = local(2026, 3, 7, 7, 0);
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: 127 }, from);
    assert.ok(at !== null);
    // The clock says 23h30m; only 22h30m of real time passes, because 02:00
    // to 03:00 never happens. Keeping the clock reading is the point.
    assert.equal(at - from.getTime(), (22 * 60 + 30) * 60 * 1000);
  });

  it('rolls a time that does not exist forward rather than skipping the day', () => {
    // 02:30 never happens on 2026-03-08. A 3am alarm silently not going off is
    // worse than one going off at 3:30, so the platform's roll-forward is the
    // behaviour we want.
    const at = nextOccurrence({ hour: 2, minute: 30, repeatDays: 127 }, local(2026, 3, 7, 7, 0));
    assert.ok(at !== null);
    const fired = new Date(at);
    assert.equal(fired.getDate(), 8);
    assert.equal(fired.getHours(), 3);
  });

  // US fall back: 2026-11-01, 02:00 EDT → 01:00 EST.
  it('keeps the wall-clock time across fall back', () => {
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: 127 }, local(2026, 10, 31, 7, 0));
    assert.equal(readable(at), '2026-11-01 06:30');
  });

  it('lands an hour more than the clock suggests across fall back', () => {
    const from = local(2026, 10, 31, 7, 0);
    const at = nextOccurrence({ hour: 6, minute: 30, repeatDays: 127 }, from);
    assert.ok(at !== null);
    // 24h30m of real time for a 23h30m clock gap: 01:00 to 02:00 happens twice.
    assert.equal(at - from.getTime(), (24 * 60 + 30) * 60 * 1000);
  });

  it('picks the first pass of an hour that happens twice', () => {
    const at = nextOccurrence({ hour: 1, minute: 30, repeatDays: 127 }, local(2026, 10, 31, 7, 0));
    assert.ok(at !== null);
    const fired = new Date(at);
    assert.equal(fired.getDate(), 1);
    assert.equal(fired.getHours(), 1);
  });
});

describe('nextOccurrence — properties', () => {
  it('is always strictly in the future and never more than eight days out', () => {
    const week = 8 * 24 * 60 * 60 * 1000;
    for (let day = 0; day < 400; day += 1) {
      for (const repeatDays of [0, MON, WEEKDAYS, WEEKEND, 127, Weekday.sunday]) {
        const from = local(2026, 1, 1 + day, (day * 7) % 24, (day * 13) % 60);
        const at = nextOccurrence({ hour: (day * 5) % 24, minute: (day * 11) % 60, repeatDays }, from);
        assert.ok(at !== null, `no occurrence for mask ${repeatDays}`);
        assert.ok(at > from.getTime(), `not in the future: ${readable(at)}`);
        assert.ok(at - from.getTime() < week, `too far out: ${readable(at)}`);
      }
    }
  });

  it('always lands on a day the mask allows', () => {
    for (let day = 0; day < 200; day += 1) {
      const repeatDays = (day % 127) + 1;
      const from = local(2026, 4, 1 + day, (day * 3) % 24, (day * 17) % 60);
      const at = nextOccurrence({ hour: 7, minute: 45, repeatDays }, from);
      assert.ok(at !== null);
      assert.ok(repeatsOn(repeatDays, new Date(at)), `mask ${repeatDays} landed on the wrong day`);
    }
  });
});
