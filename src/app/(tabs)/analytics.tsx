import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WindowSummary } from '@/domain/analytics/metrics';
import { Color, Layout, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';
import { OutcomeBar, StatTile } from '@/features/analytics/StatTile';
import { SessionRow } from '@/features/analytics/SessionRow';
import { formatCount, formatDuration, formatPercent, formatSeconds } from '@/features/analytics/format';
import { useAnalytics } from '@/features/analytics/useAnalytics';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';

/**
 * Wake history, and only wake history.
 *
 * Every figure here is computed from `wake_sessions` rows this app wrote when
 * an alarm rang. There is no sleep duration, no sleep quality, no stage
 * breakdown and no heart rate, because MathAlarm has no sensor and no wearable
 * and will not invent one. Where there is no data there is a dash.
 */
export default function AnalyticsScreen() {
  const { summary, recent, loading } = useAnalytics();
  // Named `range` rather than `window` so it cannot be confused with the global.
  const [range, setRange] = useState<'last7' | 'last30'>('last7');

  if (!summary || summary.totalSessions === 0) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Header />
          {loading ? null : <EmptyState />}
        </ScrollView>
      </Screen>
    );
  }

  const stats = summary[range];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Header />

        <Card style={styles.streak}>
          <Text style={Type.labelSm}>STREAK</Text>
          <View style={styles.streakRow}>
            <Text style={styles.streakValue}>{summary.streak}</Text>
            <Text style={[Type.bodyMd, styles.streakUnit]}>
              {summary.streak === 1 ? 'day in a row' : 'days in a row'}
            </Text>
          </View>
          <Text style={Type.bodySm}>
            {summary.streak === 0
              ? 'Days with at least one alarm solved, counted back from today.'
              : summary.streakIncludesToday
                ? 'Counted back from today. Solved at least one alarm on each of these days.'
                : 'Counted back from yesterday — today’s alarm has not been solved yet.'}
          </Text>
        </Card>

        <WindowPicker value={range} onChange={setRange} />

        <Card style={styles.panel}>
          <View style={styles.tiles}>
            <StatTile label="Alarms fired" value={formatCount(stats.fired)} />
            <StatTile
              label="Solved"
              value={formatCount(stats.solved)}
              detail={`${stats.fired - stats.solved} not solved`}
            />
            <StatTile
              label="Accuracy"
              value={formatPercent(stats.accuracy)}
              detail="of every answer given"
            />
            <StatTile
              label="Time to dismiss"
              value={formatDuration(stats.averageDismissMs)}
              detail="average, solved alarms"
            />
            <StatTile
              label="Per problem"
              value={formatSeconds(stats.averageSolveMsPerProblem)}
              detail="average solving time"
            />
            <StatTile
              label="Stopped by system"
              value={formatCount(stats.systemStopped)}
              detail="Android ended the alarm"
            />
          </View>

          <View style={styles.divider} />

          <Text style={Type.labelSm}>HOW THEY ENDED</Text>
          <OutcomeBar segments={outcomeSegments(stats)} />
        </Card>

        <View style={styles.history}>
          <Text style={Type.headlineSm}>Recent wake-ups</Text>
          <Card style={styles.panelFlush}>
            {recent.map((session, index) => (
              <SessionRow
                key={session.id}
                session={session}
                last={index === recent.length - 1}
              />
            ))}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function outcomeSegments(stats: WindowSummary) {
  return [
    { label: 'Solved', count: stats.solved, color: Color.cyan },
    { label: 'Stopped', count: stats.systemStopped, color: Color.danger },
    { label: 'Never answered', count: stats.abandoned, color: Color.textMuted },
    { label: 'Cancelled', count: stats.cancelled, color: Color.purple },
  ];
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={Type.labelSm}>MATHALARM</Text>
      <Text style={Type.headlineLg}>Analytics</Text>
    </View>
  );
}

function WindowPicker({
  value,
  onChange,
}: {
  value: 'last7' | 'last30';
  onChange: (value: 'last7' | 'last30') => void;
}) {
  const options = [
    { key: 'last7' as const, label: 'LAST 7 DAYS' },
    { key: 'last30' as const, label: 'LAST 30 DAYS' },
  ];

  return (
    <View style={styles.picker} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="radio"
            accessibilityLabel={option.label.toLowerCase()}
            accessibilityState={{ selected: on }}
            android_ripple={{ color: Color.borderStrong }}
            style={({ pressed }) => [styles.pickerItem, on && styles.pickerItemOn, pressed && styles.pickerItemPressed]}>
            <Text style={[Type.labelSm, on ? styles.pickerTextOn : styles.pickerText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <MaterialIcons name="insights" size={40} color={Color.textMuted} />
      <Text style={[Type.headlineSm, styles.emptyTitle]}>Nothing to show yet</Text>
      <Text style={[Type.bodyMd, styles.emptyBody]}>
        Every alarm that rings is recorded here — when it went off, how it ended, and how long the
        maths took. Numbers appear after your first wake-up.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl * 2,
    gap: Space.md,
  },
  header: {
    gap: Space.xxs,
  },
  streak: {
    gap: Space.xxs,
    borderColor: Color.cyanEdge,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  streakValue: {
    fontFamily: FontFamily.monoBold,
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -1.4,
    color: Color.cyan,
  },
  streakUnit: {
    color: Color.textSecondary,
  },
  picker: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  pickerItem: {
    flex: 1,
    minHeight: Layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  pickerItemOn: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  pickerItemPressed: {
    backgroundColor: Color.cardElevated,
  },
  pickerText: {
    color: Color.textSecondary,
  },
  pickerTextOn: {
    color: Color.magentaText,
  },
  panel: {
    gap: Space.md,
  },
  panelFlush: {
    paddingVertical: 0,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Color.border,
  },
  history: {
    gap: Space.xs,
    marginTop: Space.xs,
  },
  empty: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xxxl,
  },
  emptyTitle: {
    marginTop: Space.xs,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
