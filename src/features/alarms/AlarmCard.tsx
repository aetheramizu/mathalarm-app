import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Alarm } from '@/data/models';
import { REQUIRED_PROBLEMS } from '@/domain/math/engine';
import { Color, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { Card } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { Toggle } from '@/ui/toggle';

import { describeAlarm, formatCountdown, formatRepeat, formatTime, formatWhen } from './format';

type Props = {
  alarm: Alarm;
  now: number;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
};

/**
 * One row of the alarm list.
 *
 * The time is the row: everything else is a subordinate line under it, and a
 * disabled alarm dims that block rather than hiding it, so the list keeps the
 * same shape as alarms come and go.
 *
 * The unhealthy state is not a colour change. An enabled alarm with no armed
 * occurrence gets a warning chip that says "not scheduled" in words, because
 * this is the one thing the user must not misread.
 *
 * The card itself is not the touch target. The detail block and the switch are
 * separate, sibling controls, so the switch is independently reachable by a
 * screen reader and neither gesture is nested inside the other.
 */
export function AlarmCard({ alarm, now, onPress, onToggle }: Props) {
  const time = formatTime(alarm.hour, alarm.minute);
  const unscheduled = alarm.enabled && alarm.nextTriggerAt === null;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${time}${alarm.label ? `, ${alarm.label}` : ''}, ${describeAlarm(
            alarm,
            now
          )}`}
          accessibilityHint="Opens this alarm for editing"
          android_ripple={{ color: Color.borderStrong }}
          style={({ pressed }) => [
            styles.details,
            !alarm.enabled && styles.off,
            pressed && styles.detailsPressed,
          ]}>
          <Text style={[Type.displayAlarm, styles.time]} numberOfLines={1}>
            {time}
          </Text>

          {alarm.label ? (
            <Text style={Type.bodyLg} numberOfLines={1}>
              {alarm.label}
            </Text>
          ) : null}

          <Text style={Type.bodySm} numberOfLines={2}>
            {describeAlarm(alarm, now)}
          </Text>

          <View style={styles.chips}>
            <Chip
              label={`${alarm.difficulty} · ${REQUIRED_PROBLEMS[alarm.difficulty]} problems`}
              tone="accent"
            />
            {unscheduled ? <Chip label="Not scheduled" tone="warning" /> : null}
          </View>
        </Pressable>

        <View style={styles.toggleWrap}>
          <Toggle
            value={alarm.enabled}
            onValueChange={onToggle}
            accessibilityLabel={`${time}${alarm.label ? ` ${alarm.label}` : ''} alarm`}
          />
        </View>
      </View>

      {unscheduled ? (
        <View style={styles.warning}>
          <MaterialIcons name="error-outline" size={16} color={Color.danger} />
          <Text style={[Type.bodySm, styles.warningText]}>
            This alarm has no scheduled time and will not ring. Check permissions in Settings.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** The armed alarm the user actually cares about, given its own summary card. */
export function NextAlarmSummary({ alarm, now }: { alarm: Alarm; now: number }) {
  const time = formatTime(alarm.hour, alarm.minute);
  const when = alarm.nextTriggerAt === null ? '' : formatWhen(alarm.nextTriggerAt, now);
  const countdown = alarm.nextTriggerAt === null ? '' : formatCountdown(alarm.nextTriggerAt, now);

  return (
    <Card style={styles.summary}>
      <Text style={Type.labelSm}>NEXT ALARM</Text>

      <View style={styles.summaryRow}>
        <Text style={[Type.displayAlarm, styles.summaryTime]}>{time}</Text>
        <View style={styles.summaryMeta}>
          <Text style={[Type.labelMd, styles.summaryWhen]} numberOfLines={1}>
            {when.toUpperCase()}
          </Text>
          <Text style={[Type.bodySm, styles.summaryCountdown]} numberOfLines={1}>
            {countdown}
          </Text>
        </View>
      </View>

      <Text style={Type.bodyMd} numberOfLines={1}>
        {alarm.label ?? 'No label'} · {formatRepeat(alarm.repeatDays)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // The detail block paints its own padding so its ripple covers the whole
    // tappable area rather than stopping short of the card edge.
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  details: {
    flex: 1,
    gap: Space.xxs,
    paddingLeft: Space.md,
    paddingVertical: Space.md,
    paddingRight: Space.xs,
  },
  detailsPressed: {
    backgroundColor: Color.cardElevated,
  },
  off: {
    opacity: 0.45,
  },
  time: {
    fontSize: 40,
    lineHeight: 46,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.xxs,
  },
  warning: {
    marginHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Color.border,
  },
  warningText: {
    flex: 1,
    color: Color.danger,
  },
  toggleWrap: {
    paddingRight: Space.md,
    paddingVertical: Space.md,
  },
  summary: {
    gap: Space.xs,
    borderColor: Color.magentaEdge,
    backgroundColor: Color.card,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  summaryTime: {
    flexShrink: 1,
  },
  summaryMeta: {
    alignItems: 'flex-end',
    paddingBottom: Space.xs,
  },
  summaryWhen: {
    color: Color.magentaText,
  },
  summaryCountdown: {
    color: Color.textSecondary,
  },
});
