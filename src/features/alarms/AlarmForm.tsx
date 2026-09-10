import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Alarm } from '@/data/models';
import type { NewAlarm } from '@/data/repositories/alarms';
import { REQUIRED_PROBLEMS } from '@/domain/math/engine';
import type { Difficulty } from '@/domain/math/types';
import { Color, Layout, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { DangerButton, PrimaryButton } from '@/ui/button';
import { Sheet } from '@/ui/sheet';

import { DAY_PICKER, formatRepeat } from './format';
import { TimeKeypad, digitsToTime, timeToDigits, type TimeDigits } from './TimeKeypad';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const LABEL_MAX = 40;

type Props = {
  visible: boolean;
  /** The alarm being edited, or null when creating a new one. */
  alarm: Alarm | null;
  /** Pre-fills a new alarm. Never applied to an existing one, which owns its own. */
  defaultDifficulty: Difficulty;
  onClose: () => void;
  onSave: (input: NewAlarm) => Promise<void>;
  onDelete: () => Promise<void>;
};

/**
 * Create and edit, in one sheet.
 *
 * The two are the same form with different defaults, so they are the same
 * component: a separate "edit" screen would be the same four fields with a
 * second set of bugs.
 *
 * Difficulty is pre-filled from the global default only for a new alarm. An
 * existing alarm shows and keeps its own stored difficulty — changing the
 * default must never quietly rewrite an alarm the user already set.
 */
export function AlarmForm({
  visible,
  alarm,
  defaultDifficulty,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [digits, setDigits] = useState<TimeDigits>('');
  const [label, setLabel] = useState('');
  const [repeatDays, setRepeatDays] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty);
  const [saving, setSaving] = useState(false);

  // Reset when the sheet opens, not when it closes: the fields would otherwise
  // visibly blank out during the closing animation.
  useEffect(() => {
    if (!visible) return;
    setDigits(alarm ? timeToDigits(alarm.hour, alarm.minute) : defaultTime());
    setLabel(alarm?.label ?? '');
    setRepeatDays(alarm?.repeatDays ?? 0);
    setDifficulty(alarm?.difficulty ?? defaultDifficulty);
    setSaving(false);
  }, [visible, alarm, defaultDifficulty]);

  const time = digitsToTime(digits);

  const save = async () => {
    if (!time || saving) return;
    setSaving(true);
    try {
      await onSave({
        hour: time.hour,
        minute: time.minute,
        label: label.trim() === '' ? null : label.trim(),
        repeatDays,
        difficulty,
      });
      onClose();
    } catch (error) {
      setSaving(false);
      Alert.alert(
        'Could not save alarm',
        error instanceof Error ? error.message : 'The alarm could not be scheduled.'
      );
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete alarm?', 'This alarm and its schedule will be removed. History is kept.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void onDelete()
            .then(onClose)
            .catch((error: unknown) => {
              Alert.alert(
                'Could not delete alarm',
                error instanceof Error ? error.message : 'Please try again.'
              );
            });
        },
      },
    ]);
  };

  return (
    <Sheet
      visible={visible}
      title={alarm ? 'Edit alarm' : 'New alarm'}
      onClose={onClose}
      footer={
        <>
          <PrimaryButton
            label={saving ? 'Saving…' : 'Save alarm'}
            icon="check"
            onPress={save}
            disabled={!time || saving}
            accessibilityHint={time ? undefined : 'Enter a four-digit time first'}
          />
          {alarm ? <DangerButton label="Delete alarm" icon="delete-outline" onPress={confirmDelete} /> : null}
        </>
      }>
      <TimeKeypad digits={digits} onChange={setDigits} />

      <Field label="LABEL">
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Morning run"
          placeholderTextColor={Color.textMuted}
          maxLength={LABEL_MAX}
          style={[Type.bodyLg, styles.input]}
          accessibilityLabel="Alarm label"
          returnKeyType="done"
        />
      </Field>

      <Field label="REPEAT" value={formatRepeat(repeatDays)}>
        <View style={styles.days}>
          {DAY_PICKER.map((day) => {
            const on = (repeatDays & day.bit) !== 0;
            return (
              <Pressable
                key={day.bit}
                onPress={() => setRepeatDays(repeatDays ^ day.bit)}
                accessibilityRole="checkbox"
                accessibilityLabel={day.name}
                accessibilityState={{ checked: on }}
                android_ripple={{ color: Color.borderStrong }}
                style={({ pressed }) => [
                  styles.day,
                  on && styles.dayOn,
                  pressed && styles.dayPressed,
                ]}>
                <Text style={[Type.labelMd, on ? styles.dayOnText : styles.dayText]}>
                  {day.initial}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="DIFFICULTY">
        <View style={styles.difficulties} accessibilityRole="radiogroup">
          {DIFFICULTIES.map((tier) => {
            const on = tier === difficulty;
            return (
              <Pressable
                key={tier}
                onPress={() => setDifficulty(tier)}
                accessibilityRole="radio"
                accessibilityLabel={`${tier}, ${REQUIRED_PROBLEMS[tier]} problems`}
                accessibilityState={{ selected: on }}
                android_ripple={{ color: Color.borderStrong }}
                style={({ pressed }) => [
                  styles.tier,
                  on && styles.tierOn,
                  pressed && styles.dayPressed,
                ]}>
                <Text style={[Type.labelMd, on ? styles.dayOnText : styles.dayText]}>
                  {tier.toUpperCase()}
                </Text>
                <Text style={[Type.bodySm, on && styles.tierOnCount]}>
                  {REQUIRED_PROBLEMS[tier]} to solve
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
    </Sheet>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={Type.labelSm}>{label}</Text>
        {value ? <Text style={[Type.labelSm, styles.fieldValue]}>{value.toUpperCase()}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A new alarm opens on the next round hour, which is usually close to right. */
function defaultTime(): TimeDigits {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  return timeToDigits(next.getHours(), 0);
}

const styles = StyleSheet.create({
  field: {
    gap: Space.xs,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    color: Color.magentaText,
  },
  input: {
    minHeight: Layout.minTouch,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    color: Color.textPrimary,
  },
  days: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  day: {
    flex: 1,
    height: Layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  dayOn: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  dayPressed: {
    backgroundColor: Color.cardElevated,
  },
  dayText: {
    color: Color.textSecondary,
  },
  dayOnText: {
    color: Color.magentaText,
  },
  difficulties: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  tier: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  tierOn: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  tierOnCount: {
    color: Color.textPrimary,
  },
});
