import type { WakeSessionOutcome } from '@/data/models';

/**
 * How Analytics renders a number — and, more importantly, how it renders the
 * absence of one.
 *
 * A metric with no data behind it is `null`, and `null` renders as an em dash.
 * It never renders as `0%`, `0s`, or "no data yet, keep going!": each of those
 * is a claim about the user's mornings that the database cannot support.
 */

export const NO_VALUE = '—';

/** "45s", "1m 12s", "1h 04m" — the largest two units, never more. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return NO_VALUE;

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Sub-minute values keep a decimal, because 4.2s and 4.8s are different mornings. */
export function formatSeconds(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return NO_VALUE;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatDuration(ms);
}

export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return NO_VALUE;
  return `${Math.round(fraction * 100)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null) return NO_VALUE;
  return String(value);
}

const OUTCOME_LABEL: Record<WakeSessionOutcome, string> = {
  ringing: 'Ringing',
  solved: 'Solved',
  system_stopped: 'Stopped by system',
  cancelled: 'Cancelled',
  abandoned: 'Never answered',
};

export function formatOutcome(outcome: WakeSessionOutcome): string {
  return OUTCOME_LABEL[outcome] ?? outcome;
}

/** "Fri 11 Sep · 06:30" — the day it rang and the minute it was set for. */
export function formatSessionWhen(firedAt: number): string {
  const date = new Date(firedAt);
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} · ${time}`;
}
