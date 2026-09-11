import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Alarm } from '@/data/models';
import { REQUIRED_PROBLEMS } from '@/domain/math/engine';
import { Color, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';
import { Card } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { Toggle } from '@/ui/toggle';

import {
  describeAlarm,
  formatCountdown,
  formatCountdownValue,
  formatRepeat,
  formatTime,
  formatWhen,
  splitClock,
} from './format';

type Props = {
  alarm: Alarm;
  now: number;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
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
export function AlarmCard({ alarm, now, onPress, onToggle, onDelete }: Props) {
  const time = formatTime(alarm.hour, alarm.minute);
  const clock = splitClock(alarm.hour, alarm.minute);
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
          {/*
            No accessibility props: the pressable around it is already one node
            carrying the whole alarm, digits and meridiem included.
          */}
          <View style={styles.clock}>
            <Text style={[Type.displayAlarm, styles.time]} numberOfLines={1}>
              {clock.time}
            </Text>
            <Text style={[Type.labelLg, styles.meridiem]}>{clock.meridiem}</Text>
          </View>

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
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete alarm"
            style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}>
            <MaterialIcons name="delete-outline" size={24} color={Color.textMuted} />
          </Pressable>
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

/**
 * The armed alarm the user actually cares about, given its own summary card.
 *
 * Two things were wrong with it. It was the most prominent thing on the screen
 * and the only card that did nothing when tapped, which reads as a bug rather
 * than as a decision — so it now opens the same editor every other alarm row
 * does. And the number the user actually came to the screen for, how long they
 * have got, was set in the smallest type on the card, below a weekday name that
 * matters far less. That is now the headline: the time the alarm is set for is
 * a fact you already know, "3h 42m" is the one you are checking.
 */
export function NextAlarmSummary({
  alarm,
  now,
  onPress,
}: {
  alarm: Alarm;
  now: number;
  onPress: () => void;
}) {
  const clock = splitClock(alarm.hour, alarm.minute);
  const when = alarm.nextTriggerAt === null ? '' : formatWhen(alarm.nextTriggerAt, now);
  const countdown =
    alarm.nextTriggerAt === null ? '' : formatCountdownValue(alarm.nextTriggerAt, now);

  return (
    <Card
      style={styles.summary}
      onPress={onPress}
      accessibilityLabel={`Next alarm, ${formatTime(alarm.hour, alarm.minute)}, ${describeAlarm(
        alarm,
        now
      )}`}
      accessibilityHint="Opens this alarm for editing">
      <View style={styles.summaryHead}>
        <Text style={Type.labelSm}>NEXT ALARM</Text>
        <Text style={[Type.labelSm, styles.summaryWhen]} numberOfLines={1}>
          {when.toUpperCase()}
        </Text>
        {/*
          The card is the button, so the chevron is decoration for the eye and
          is kept out of the accessibility tree — the hint above already says
          what tapping does.
        */}
        <MaterialIcons
          name="chevron-right"
          size={18}
          color={Color.textMuted}
          importantForAccessibility="no"
        />
      </View>

      <View style={styles.clock}>
        <Text style={Type.displayAlarm}>{clock.time}</Text>
        <Text style={[Type.labelLg, styles.meridiem]}>{clock.meridiem}</Text>
      </View>

      <View style={styles.countdown}>
        <Text style={Type.labelSm}>RINGS IN</Text>
        <Text style={styles.countdownValue} numberOfLines={1}>
          {countdown}
        </Text>
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
    alignItems: 'center',
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
  // Baseline-aligned rather than centred: the meridiem should sit on the same
  // line the digits stand on, the way it does on a clock face.
  clock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  time: {
    fontSize: 40,
    lineHeight: 46,
  },
  meridiem: {
    color: Color.textSecondary,
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
    alignItems: 'center',
    gap: Space.md,
  },
  deleteAction: {
    padding: Space.xs,
    borderRadius: Radius.sm,
  },
  deleteActionPressed: {
    backgroundColor: Color.cardElevated,
  },
  summary: {
    gap: Space.xs,
    borderColor: Color.magentaEdge,
    backgroundColor: Color.card,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  summaryWhen: {
    flex: 1,
    textAlign: 'right',
    color: Color.magentaText,
  },
  // Its own banded row rather than a line of body text: this is the number the
  // screen exists to answer, and it has to be readable from across a room.
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.xxs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Color.magentaFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.magentaEdge,
  },
  countdownValue: {
    fontFamily: FontFamily.monoBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: Color.magentaText,
  },
});
