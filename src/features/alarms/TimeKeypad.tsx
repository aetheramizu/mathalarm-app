import { StyleSheet, Text, View } from 'react-native';

import { Color, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';
import { Keypad } from '@/ui/keypad';

/**
 * Time entry as four typed digits, HH:MM on a 24-hour clock.
 *
 * A keypad rather than a wheel or a dial, decided in the PRD: a wheel is a drag
 * gesture with no keyboard equivalent, it is imprecise with a thumb, and it has
 * no obvious accessible fallback. Four digits are unambiguous, and the same pad
 * component is what the wake screen uses, so there is one input idiom in the
 * app rather than two.
 *
 * Invalid times are prevented rather than rejected: at each position the digits
 * that could not lead to a real time are disabled, so `29:71` is never typed in
 * the first place and there is no error message to write.
 */

export type TimeDigits = string;

export function timeToDigits(hour: number, minute: number): TimeDigits {
  return `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
}

/** Null until all four digits are present. */
export function digitsToTime(digits: TimeDigits): { hour: number; minute: number } | null {
  if (digits.length !== 4) return null;
  return { hour: Number(digits.slice(0, 2)), minute: Number(digits.slice(2)) };
}

/**
 * Which digits are legal at the position about to be typed.
 *
 * Position 0 caps the hour's tens at 2; position 1 caps the ones at 3 when the
 * tens are 2, giving 00–23; position 2 caps the minute's tens at 5.
 */
function allowedAt(digits: TimeDigits, digit: number): boolean {
  switch (digits.length) {
    case 0:
      return digit <= 2;
    case 1:
      return digits[0] === '2' ? digit <= 3 : true;
    case 2:
      return digit <= 5;
    case 3:
      return true;
    default:
      return false;
  }
}

type Props = {
  digits: TimeDigits;
  onChange: (digits: TimeDigits) => void;
};

export function TimeKeypad({ digits, onChange }: Props) {
  const slots = [0, 1, 2, 3];

  return (
    <View style={styles.root}>
      <View
        style={styles.readout}
        accessibilityRole="text"
        accessibilityLabel={
          digits.length === 4
            ? `Alarm time ${digits.slice(0, 2)}:${digits.slice(2)}`
            : `Alarm time incomplete, ${digits.length} of 4 digits entered`
        }>
        {slots.map((slot) => (
          <View key={slot} style={styles.slotGroup}>
            <Text
              style={[
                styles.slot,
                slot >= digits.length && styles.slotEmpty,
                slot === digits.length && styles.slotActive,
              ]}>
              {digits[slot] ?? '–'}
            </Text>
            {slot === 1 ? <Text style={styles.colon}>:</Text> : null}
          </View>
        ))}
      </View>

      <Text style={[Type.labelSm, styles.hint]}>
        {digits.length === 4 ? '24-HOUR CLOCK' : 'ENTER FOUR DIGITS'}
      </Text>

      <Keypad
        keyHeight={56}
        onDigit={(digit) => {
          if (digits.length >= 4) return;
          if (!allowedAt(digits, digit)) return;
          onChange(digits + String(digit));
        }}
        onBackspace={() => onChange(digits.slice(0, -1))}
        isDigitDisabled={(digit) => digits.length >= 4 || !allowedAt(digits, digit)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.sm,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  slotGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  slot: {
    fontFamily: FontFamily.monoBold,
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: -1,
    color: Color.textPrimary,
    minWidth: 34,
    textAlign: 'center',
  },
  slotEmpty: {
    color: Color.textMuted,
  },
  // The cursor. A border rather than a blinking caret: nothing on this screen
  // animates for its own sake, and a static marker is readable at a glance.
  slotActive: {
    color: Color.magentaText,
    borderBottomWidth: 2,
    borderBottomColor: Color.magenta,
  },
  colon: {
    fontFamily: FontFamily.monoBold,
    fontSize: 52,
    lineHeight: 60,
    color: Color.textSecondary,
    paddingHorizontal: Space.xxs,
  },
  hint: {
    textAlign: 'center',
    color: Color.textMuted,
  },
});
