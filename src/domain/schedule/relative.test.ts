process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { localDayOffset, remaining, startOfLocalDay } from './relative';

function local(year: number, month: number, day: number, hour: number, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

describe('localDayOffset', () => {
  it('is zero within the same calendar day', () => {
    assert.equal(localDayOffset(local(2026, 9, 11, 0, 1), local(2026, 9, 11, 23, 59)), 0);
  });

  it('is one across midnight, however few minutes apart', () => {
    assert.equal(localDayOffset(local(2026, 9, 11, 23, 59), local(2026, 9, 12, 0, 1)), 1);
  });

  it('counts a nearly full day inside one date as zero', () => {
    // The naive "divide the gap by 24 hours" answer here is 0 as well, but it
    // is 0 for the wrong reason — the case below is the one it fails.
    assert.equal(localDayOffset(local(2026, 9, 11, 1, 0), local(2026, 9, 11, 22, 0)), 0);
  });

  it('survives spring forward, when a local day is 23 hours', () => {
    assert.equal(localDayOffset(local(2026, 3, 7, 20, 0), local(2026, 3, 8, 7, 0)), 1);
    assert.equal(localDayOffset(local(2026, 3, 7, 0, 30), local(2026, 3, 9, 0, 30)), 2);
  });

  it('survives fall back, when a local day is 25 hours', () => {
    assert.equal(localDayOffset(local(2026, 10, 31, 20, 0), local(2026, 11, 1, 7, 0)), 1);
    assert.equal(localDayOffset(local(2026, 10, 31, 0, 30), local(2026, 11, 2, 0, 30)), 2);
  });

  it('goes negative for the past', () => {
    assert.equal(localDayOffset(local(2026, 9, 11, 12, 0), local(2026, 9, 9, 12, 0)), -2);
  });

  it('crosses months and years', () => {
    assert.equal(localDayOffset(local(2026, 12, 31, 23, 0), local(2027, 1, 1, 1, 0)), 1);
  });
});

describe('startOfLocalDay', () => {
  it('lands on local midnight', () => {
    const midnight = new Date(startOfLocalDay(local(2026, 9, 11, 17, 42)));
    assert.equal(midnight.getHours(), 0);
    assert.equal(midnight.getMinutes(), 0);
    assert.equal(midnight.getDate(), 11);
  });
});

describe('remaining', () => {
  const from = local(2026, 9, 11, 6, 0);

  it('splits an interval into days, hours and minutes', () => {
    const d = remaining(from, from + ((26 * 60 + 5) * 60_000));
    assert.deepEqual(d, { days: 1, hours: 2, minutes: 5, imminent: false });
  });

  it('rounds part-minutes up so a countdown never sits on zero', () => {
    assert.equal(remaining(from, from + 90_000).minutes, 2);
    assert.equal(remaining(from, from + 61_000).minutes, 2);
    assert.equal(remaining(from, from + 60_000).minutes, 1);
  });

  it('still counts a part-minute as one minute rather than as now', () => {
    const almost = remaining(from, from + 59_000);
    assert.equal(almost.imminent, false);
    assert.equal(almost.minutes, 1);
  });

  it('is imminent only once the target has arrived or passed', () => {
    assert.ok(remaining(from, from).imminent);
    assert.ok(remaining(from, from - 10_000).imminent);
  });

  it('reports whole hours with zero minutes', () => {
    assert.deepEqual(remaining(from, from + 2 * 3_600_000), {
      days: 0,
      hours: 2,
      minutes: 0,
      imminent: false,
    });
  });
});
