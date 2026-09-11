process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summarise, type SessionRecord } from './metrics';

/**
 * These tests are as much about what Analytics must *not* say as about what it
 * says. A missing metric has to stay null so the screen can show "—"; a zero
 * would be a claim the data does not support.
 */

const NOW = new Date(2026, 8, 11, 12, 0, 0, 0).getTime(); // Friday 2026-09-11, midday

/** A local timestamp `daysAgo` days before today, at `hour`. */
function daysAgo(days: number, hour = 6, minute = 30): number {
  const today = new Date(NOW);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - days, hour, minute).getTime();
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const firedAt = overrides.firedAt ?? daysAgo(0);
  return {
    firedAt,
    firstAnswerAt: firedAt + 10_000,
    dismissedAt: firedAt + 40_000,
    outcome: 'solved',
    correctCount: 3,
    wrongCount: 1,
    requiredProblems: 3,
    ...overrides,
  };
}

describe('empty history', () => {
  const summary = summarise([], NOW);

  it('reports no sessions rather than a dashboard of zeros', () => {
    assert.equal(summary.totalSessions, 0);
    assert.equal(summary.streak, 0);
  });

  it('leaves every derived metric null', () => {
    assert.equal(summary.last7.accuracy, null);
    assert.equal(summary.last7.averageDismissMs, null);
    assert.equal(summary.last7.averageSolveMsPerProblem, null);
    assert.equal(summary.last30.accuracy, null);
  });
});

describe('windows', () => {
  it('counts today and the six days before it as the last 7 days', () => {
    const sessions = [session({ firedAt: daysAgo(0) }), session({ firedAt: daysAgo(6) })];
    assert.equal(summarise(sessions, NOW).last7.fired, 2);
  });

  it('excludes the seventh day back', () => {
    const summary = summarise([session({ firedAt: daysAgo(7) })], NOW);
    assert.equal(summary.last7.fired, 0);
    assert.equal(summary.last30.fired, 1, 'but the 30-day window still has it');
  });

  it('excludes anything past the 30-day boundary', () => {
    const summary = summarise([session({ firedAt: daysAgo(30) })], NOW);
    assert.equal(summary.last30.fired, 0);
    assert.equal(summary.totalSessions, 1, 'the row is still on record');
  });

  it('keeps an alarm that fired earlier today, not a rolling 168 hours', () => {
    // Fired at 00:05 today: a rolling seven-day window would still hold it, but
    // so would a calendar one — the case that separates them is the boundary
    // day, covered above.
    assert.equal(summarise([session({ firedAt: daysAgo(0, 0, 5) })], NOW).last7.fired, 1);
  });

  it('ignores an alarm that has not fired yet', () => {
    const future = new Date(NOW + 86_400_000).getTime();
    assert.equal(summarise([session({ firedAt: future })], NOW).last7.fired, 0);
  });
});

describe('outcome counts', () => {
  const sessions = [
    session({ outcome: 'solved' }),
    session({ outcome: 'solved', firedAt: daysAgo(1) }),
    session({ outcome: 'system_stopped', firedAt: daysAgo(2) }),
    session({ outcome: 'abandoned', firedAt: daysAgo(3) }),
    session({ outcome: 'cancelled', firedAt: daysAgo(4) }),
  ];

  it('groups by outcome', () => {
    const week = summarise(sessions, NOW).last7;
    assert.equal(week.fired, 5);
    assert.equal(week.solved, 2);
    assert.equal(week.systemStopped, 1);
    assert.equal(week.abandoned, 1);
    assert.equal(week.cancelled, 1);
  });

  it('excludes sessions still ringing from every count', () => {
    // An alarm going off right now is not a failure, and must not be counted as
    // one — nor as a session at all until it closes.
    const withRinging = [...sessions, session({ outcome: 'ringing', dismissedAt: null })];
    const summary = summarise(withRinging, NOW);
    assert.equal(summary.last7.fired, 5);
    assert.equal(summary.totalSessions, 5);
  });
});

describe('accuracy', () => {
  it('is correct answers over all answers', () => {
    const sessions = [
      session({ correctCount: 3, wrongCount: 1 }),
      session({ correctCount: 3, wrongCount: 3, firedAt: daysAgo(1) }),
    ];
    assert.equal(summarise(sessions, NOW).last7.accuracy, 6 / 10);
  });

  it('counts answers from sessions that were never solved', () => {
    // Getting three wrong and falling back asleep is part of the accuracy
    // record; dropping it would flatter every number on the screen.
    const sessions = [session({ outcome: 'abandoned', correctCount: 1, wrongCount: 3 })];
    assert.equal(summarise(sessions, NOW).last7.accuracy, 0.25);
  });

  it('is null, not zero, when nothing was answered', () => {
    const sessions = [session({ outcome: 'abandoned', correctCount: 0, wrongCount: 0 })];
    assert.equal(summarise(sessions, NOW).last7.accuracy, null);
  });
});

describe('durations', () => {
  it('measures time to dismiss from the alarm firing', () => {
    const firedAt = daysAgo(0);
    const sessions = [session({ firedAt, dismissedAt: firedAt + 60_000 })];
    assert.equal(summarise(sessions, NOW).last7.averageDismissMs, 60_000);
  });

  it('measures solve speed per problem from the first answer', () => {
    const firedAt = daysAgo(0);
    const sessions = [
      session({
        firedAt,
        // Ten minutes asleep, then 30 seconds of arithmetic over 3 problems.
        firstAnswerAt: firedAt + 600_000,
        dismissedAt: firedAt + 630_000,
        requiredProblems: 3,
      }),
    ];
    assert.equal(summarise(sessions, NOW).last7.averageSolveMsPerProblem, 10_000);
  });

  it('ignores unsolved sessions in both durations', () => {
    const firedAt = daysAgo(0);
    const sessions = [
      session({ outcome: 'abandoned', firedAt, dismissedAt: firedAt + 3_600_000 }),
      session({ outcome: 'solved', firedAt: daysAgo(1), dismissedAt: daysAgo(1) + 20_000 }),
    ];
    // The hour-long abandoned ring would otherwise dominate the average.
    assert.equal(summarise(sessions, NOW).last7.averageDismissMs, 20_000);
  });

  it('ignores a solved session that was never actually answered', () => {
    const sessions = [session({ firstAnswerAt: null })];
    assert.equal(summarise(sessions, NOW).last7.averageSolveMsPerProblem, null);
  });
});

describe('streak', () => {
  const solvedOn = (days: number) => session({ outcome: 'solved', firedAt: daysAgo(days) });

  it('counts consecutive days ending today', () => {
    const summary = summarise([solvedOn(0), solvedOn(1), solvedOn(2)], NOW);
    assert.equal(summary.streak, 3);
    assert.ok(summary.streakIncludesToday);
  });

  it('stays alive when today has not happened yet', () => {
    const summary = summarise([solvedOn(1), solvedOn(2)], NOW);
    assert.equal(summary.streak, 2);
    assert.equal(summary.streakIncludesToday, false);
  });

  it('is over once the most recent solved day is older than yesterday', () => {
    assert.equal(summarise([solvedOn(2), solvedOn(3), solvedOn(4)], NOW).streak, 0);
  });

  it('stops at the first missed day', () => {
    assert.equal(summarise([solvedOn(0), solvedOn(1), solvedOn(3)], NOW).streak, 2);
  });

  it('counts a day once however many alarms were solved on it', () => {
    const sessions = [solvedOn(0), session({ outcome: 'solved', firedAt: daysAgo(0, 13) }), solvedOn(1)];
    assert.equal(summarise(sessions, NOW).streak, 2);
  });

  it('ignores days whose alarms were not solved', () => {
    const sessions = [
      solvedOn(0),
      session({ outcome: 'abandoned', firedAt: daysAgo(1) }),
      solvedOn(2),
    ];
    assert.equal(summarise(sessions, NOW).streak, 1);
  });

  it('reaches beyond the 30-day window', () => {
    // The streak is all-time history, not a windowed count.
    const sessions = Array.from({ length: 40 }, (_, index) => solvedOn(index));
    assert.equal(summarise(sessions, NOW).streak, 40);
  });

  it('survives a daylight-saving change', () => {
    // 2026-11-01 is the fall-back day; a streak stepping back by 24 hours
    // instead of by calendar days would skip or double a day here.
    const now = new Date(2026, 10, 3, 12, 0, 0, 0).getTime();
    const on = (year: number, month: number, day: number) =>
      session({ outcome: 'solved', firedAt: new Date(year, month - 1, day, 6, 30).getTime() });
    const sessions = [on(2026, 11, 3), on(2026, 11, 2), on(2026, 11, 1), on(2026, 10, 31)];
    assert.equal(summarise(sessions, now).streak, 4);
  });
});

describe('mood analytics', () => {
  it('handles empty mood history gracefully', () => {
    const summary = summarise([session(), session()], NOW);
    assert.equal(summary.totalMoodSessions, 0);
    assert.equal(summary.moodPerformance.length, 0);
    assert.equal(summary.moodDistribution.length, 4);
    for (const item of summary.moodDistribution) {
      assert.equal(item.count, 0);
      assert.equal(item.percentage, 0);
    }
  });

  it('calculates mood distribution percentages across recorded moods', () => {
    const sessions = [
      session({ mood: 'happy' }),
      session({ mood: 'happy' }),
      session({ mood: 'sad' }),
      session({ mood: 'excited' }),
      session({ mood: null }), // skipped check-in
    ];
    const summary = summarise(sessions, NOW);
    assert.equal(summary.totalMoodSessions, 4);

    const happy = summary.moodDistribution.find((m) => m.mood === 'happy')!;
    const sad = summary.moodDistribution.find((m) => m.mood === 'sad')!;
    const excited = summary.moodDistribution.find((m) => m.mood === 'excited')!;
    const angry = summary.moodDistribution.find((m) => m.mood === 'angry')!;

    assert.equal(happy.count, 2);
    assert.equal(happy.percentage, 50);
    assert.equal(sad.count, 1);
    assert.equal(sad.percentage, 25);
    assert.equal(excited.count, 1);
    assert.equal(excited.percentage, 25);
    assert.equal(angry.count, 0);
    assert.equal(angry.percentage, 0);
  });

  it('requires at least 3 solved sessions before surfacing performance by mood', () => {
    // 2 happy sessions: insufficient sample size (< 3)
    const sessions2 = [
      session({ mood: 'happy', correctCount: 3, wrongCount: 0 }),
      session({ mood: 'happy', correctCount: 2, wrongCount: 1 }),
    ];
    const summary2 = summarise(sessions2, NOW);
    assert.equal(summary2.moodPerformance.length, 0, '2 sessions should not appear in performance');

    // 3 happy sessions: meets minimum threshold (>= 3)
    const sessions3 = [
      ...sessions2,
      session({ mood: 'happy', correctCount: 3, wrongCount: 0 }),
    ];
    const summary3 = summarise(sessions3, NOW);
    assert.equal(summary3.moodPerformance.length, 1);
    const perf = summary3.moodPerformance[0];
    assert.equal(perf.mood, 'happy');
    assert.equal(perf.count, 3);
    assert.ok(perf.accuracy !== null);
    assert.ok(perf.averageSolveMsPerProblem !== null);
  });

  it('only calculates mood performance for solved sessions', () => {
    const sessions = [
      session({ mood: 'angry', outcome: 'solved' }),
      session({ mood: 'angry', outcome: 'solved' }),
      session({ mood: 'angry', outcome: 'abandoned' }), // not solved
    ];
    const summary = summarise(sessions, NOW);
    // Only 2 solved angry sessions, so performance is not shown
    assert.equal(summary.moodPerformance.length, 0);
  });
});

