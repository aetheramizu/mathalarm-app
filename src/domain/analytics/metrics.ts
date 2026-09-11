import { MOODS, type Mood } from '../mood/types';
import { localDayOffset, startOfLocalDay } from '../schedule/relative';

/**
 * Every number Analytics is allowed to show.
 *
 * The rule this file exists to enforce is that a metric either comes from a
 * recorded wake session or it does not exist. MathAlarm has no sensors and no
 * wearable, so there is no sleep duration, no sleep quality, no stage
 * breakdown, and nothing estimated to fill a gap. A metric with no data behind
 * it is `null`, and the screen renders `null` as "—" rather than as zero — a
 * zero is a claim, and it would be a false one.
 */

/** Structurally what a `wake_sessions` row provides; declared here so `domain/` stays standalone. */
export type SessionRecord = {
  firedAt: number;
  firstAnswerAt: number | null;
  dismissedAt: number | null;
  outcome: 'ringing' | 'solved' | 'system_stopped' | 'cancelled' | 'abandoned';
  correctCount: number;
  wrongCount: number;
  requiredProblems: number;
  mood?: string | null;
};

export type WindowSummary = {
  /** How many local calendar days the window covers, today included. */
  days: number;
  fired: number;
  solved: number;
  systemStopped: number;
  abandoned: number;
  cancelled: number;
  /** Correct answers as a fraction of all answers. Null when nothing was answered. */
  accuracy: number | null;
  /** Mean time from the alarm firing to it being silenced. Solved sessions only. */
  averageDismissMs: number | null;
  /** Mean time spent solving, per problem. Solved sessions that were actually answered. */
  averageSolveMsPerProblem: number | null;
};

export type MoodDistributionItem = {
  mood: Mood;
  label: string;
  emoji: string;
  color: string;
  count: number;
  percentage: number;
};

export type MoodPerformanceItem = {
  mood: Mood;
  label: string;
  emoji: string;
  color: string;
  count: number;
  accuracy: number | null;
  averageSolveMsPerProblem: number | null;
};

export type AnalyticsSummary = {
  /** Consecutive local days ending today or yesterday with at least one solved session. */
  streak: number;
  /** True when the streak includes today — the difference between "kept" and "about to break". */
  streakIncludesToday: boolean;
  last7: WindowSummary;
  last30: WindowSummary;
  /** Closed sessions on record, all time. Zero means the empty state, not a dashboard of zeros. */
  totalSessions: number;
  moodDistribution: MoodDistributionItem[];
  moodPerformance: MoodPerformanceItem[];
  totalMoodSessions: number;
};

export const WINDOW_DAYS = { short: 7, long: 30 } as const;

/**
 * The one place session rows turn into numbers.
 *
 * Rows still `ringing` are excluded everywhere: they are alarms in progress or
 * ones reconciliation has not closed out yet, and counting them would make a
 * wake-up that has not finished look like one that failed.
 */
export function summarise(sessions: SessionRecord[], now: number): AnalyticsSummary {
  const closed = sessions.filter((session) => session.outcome !== 'ringing');
  const streak = computeStreak(closed, now);

  const moodSessions = closed.filter(
    (s) => s.mood && MOODS.some((m) => m.key === s.mood)
  );
  const totalMoodSessions = moodSessions.length;

  const moodDistribution: MoodDistributionItem[] = MOODS.map((m) => {
    const count = moodSessions.filter((s) => s.mood === m.key).length;
    const percentage = totalMoodSessions > 0 ? Math.round((count / totalMoodSessions) * 100) : 0;
    return {
      mood: m.key,
      label: m.label,
      emoji: m.emoji,
      color: m.color,
      count,
      percentage,
    };
  });

  const moodPerformance: MoodPerformanceItem[] = [];
  for (const m of MOODS) {
    const forMood = moodSessions.filter((s) => s.mood === m.key && s.outcome === 'solved');
    if (forMood.length >= 3) {
      let correct = 0;
      let wrong = 0;
      for (const s of forMood) {
        correct += s.correctCount;
        wrong += s.wrongCount;
      }
      const perProblem = forMood
        .filter((s) => s.firstAnswerAt !== null && s.requiredProblems > 0)
        .map((s) => solveMs(s) / s.requiredProblems)
        .filter((value) => Number.isFinite(value));

      moodPerformance.push({
        mood: m.key,
        label: m.label,
        emoji: m.emoji,
        color: m.color,
        count: forMood.length,
        accuracy: correct + wrong === 0 ? null : correct / (correct + wrong),
        averageSolveMsPerProblem: mean(perProblem),
      });
    }
  }

  return {
    streak: streak.length,
    streakIncludesToday: streak.includesToday,
    last7: summariseWindow(closed, now, WINDOW_DAYS.short),
    last30: summariseWindow(closed, now, WINDOW_DAYS.long),
    totalSessions: closed.length,
    moodDistribution,
    moodPerformance,
    totalMoodSessions,
  };
}

/**
 * Windows are cut on local midnight, not on a rolling 168 hours: "the last 7
 * days" to a person means today and the six days before it, and a rolling
 * window would drop this morning's alarm at lunchtime a week later.
 */
function summariseWindow(sessions: SessionRecord[], now: number, days: number): WindowSummary {
  const inWindow = sessions.filter((session) => {
    const offset = localDayOffset(session.firedAt, now);
    return offset >= 0 && offset < days;
  });

  const solved = inWindow.filter((session) => session.outcome === 'solved');

  let correct = 0;
  let wrong = 0;
  for (const session of inWindow) {
    correct += session.correctCount;
    wrong += session.wrongCount;
  }

  const dismissDurations = solved
    .filter((session) => session.dismissedAt !== null)
    .map((session) => (session.dismissedAt as number) - session.firedAt);

  // Per problem rather than per session, so a hard alarm is not reported as
  // five times slower than an easy one for doing five times the work.
  const perProblem = solved
    .filter((session) => session.firstAnswerAt !== null && session.requiredProblems > 0)
    .map((session) => solveMs(session) / session.requiredProblems)
    .filter((value) => Number.isFinite(value));

  return {
    days,
    fired: inWindow.length,
    solved: solved.length,
    systemStopped: countOutcome(inWindow, 'system_stopped'),
    abandoned: countOutcome(inWindow, 'abandoned'),
    cancelled: countOutcome(inWindow, 'cancelled'),
    accuracy: correct + wrong === 0 ? null : correct / (correct + wrong),
    averageDismissMs: mean(dismissDurations),
    averageSolveMsPerProblem: mean(perProblem),
  };
}

/**
 * Time spent solving: from the first answer to the dismissal, not from the
 * moment the alarm started ringing. Sleeping through the first ten minutes is
 * not slow arithmetic.
 */
function solveMs(session: SessionRecord): number {
  if (session.firstAnswerAt === null || session.dismissedAt === null) return NaN;
  return session.dismissedAt - session.firstAnswerAt;
}

function countOutcome(sessions: SessionRecord[], outcome: SessionRecord['outcome']): number {
  return sessions.filter((session) => session.outcome === outcome).length;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Consecutive local calendar days carrying at least one solved session, counted
 * backwards from the most recent one.
 *
 * It is history, not a game: there is no XP, no level, no badge and no reward
 * attached to it anywhere in the app. A streak whose most recent day is older
 * than yesterday is over, and reads as zero rather than as a number frozen
 * from whenever it lapsed.
 */
function computeStreak(
  sessions: SessionRecord[],
  now: number
): { length: number; includesToday: boolean } {
  const solvedDays = new Set<number>();
  for (const session of sessions) {
    if (session.outcome === 'solved') solvedDays.add(startOfLocalDay(session.firedAt));
  }
  if (solvedDays.size === 0) return { length: 0, includesToday: false };

  const today = startOfLocalDay(now);
  const includesToday = solvedDays.has(today);

  // A streak counts as live if it reaches yesterday: today's alarm may simply
  // not have gone off yet.
  const yesterday = startOfLocalDay(previousDay(now));
  if (!includesToday && !solvedDays.has(yesterday)) return { length: 0, includesToday: false };

  let length = 0;
  let cursor = includesToday ? today : yesterday;
  while (solvedDays.has(cursor)) {
    length += 1;
    cursor = startOfLocalDay(previousDay(cursor));
  }

  return { length, includesToday };
}

/**
 * The same clock time one calendar day earlier. Stepping by calendar fields
 * rather than by 24 hours is what keeps a streak intact across a DST change.
 */
function previousDay(at: number): number {
  const date = new Date(at);
  date.setDate(date.getDate() - 1);
  return date.getTime();
}
