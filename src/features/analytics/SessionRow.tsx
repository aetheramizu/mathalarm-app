import { StyleSheet, Text, View } from 'react-native';

import type { WakeSession } from '@/data/models';
import { Color, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { MOODS } from '@/domain/mood/types';
import { Chip, type ChipTone } from '@/ui/chip';

import { NO_VALUE, formatDuration, formatOutcome, formatSeconds, formatSessionWhen } from './format';

const TONE: Record<WakeSession['outcome'], ChipTone> = {
  solved: 'positive',
  ringing: 'accent',
  system_stopped: 'warning',
  cancelled: 'neutral',
  abandoned: 'warning',
};

/**
 * One wake-up, as it actually happened.
 *
 * Every value on the row is a stored column: when it rang, what it was called,
 * how it ended, how long it took, and how many answers were right and wrong.
 * A session that ended without being solved shows dashes where its timings
 * would be rather than borrowing plausible ones.
 */
export function SessionRow({ session, last }: { session: WakeSession; last?: boolean }) {
  const answered = session.correctCount + session.wrongCount;
  const dismissMs =
    session.dismissedAt === null ? null : session.dismissedAt - session.firedAt;
  const moodItem = session.mood ? MOODS.find((m) => m.key === session.mood) : null;
  const moodPrefix = moodItem ? `${moodItem.emoji} ` : '';

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.head}>
        <Text style={[Type.labelMd, styles.when]}>{formatSessionWhen(session.firedAt)}</Text>
        <Chip label={formatOutcome(session.outcome)} tone={TONE[session.outcome]} />
      </View>

      <Text style={Type.bodyMd} numberOfLines={1}>
        {moodPrefix}{session.alarmLabel ?? 'No label'} · {session.difficulty}
      </Text>

      <View style={styles.metrics}>
        <Metric label="Rang for" value={formatDuration(dismissMs)} />
        <Metric label="Solving" value={formatSeconds(session.solveMs)} />
        <Metric
          label="Answers"
          value={answered === 0 ? NO_VALUE : `${session.correctCount}/${answered}`}
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={Type.labelSm}>{label.toUpperCase()}</Text>
      <Text style={[Type.bodyMd, value === NO_VALUE ? styles.empty : styles.filled]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Space.xxs,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Color.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs,
  },
  when: {
    color: Color.textPrimary,
  },
  metrics: {
    flexDirection: 'row',
    gap: Space.lg,
    marginTop: Space.xxs,
  },
  metric: {
    gap: 1,
  },
  filled: {
    color: Color.textPrimary,
  },
  empty: {
    color: Color.textMuted,
  },
});
