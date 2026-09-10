import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Color, Space } from '@/design/tokens';
import { FontFamily } from '@/design/typography';

import { KeypadKey } from './keypad-key';

export type KeypadAction = {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'neutral';
};

type Props = {
  onDigit: (digit: number) => void;
  onBackspace: () => void;
  /** Lets the caller grey out digits that would make the entry invalid. */
  isDigitDisabled?: (digit: number) => boolean;
  /** The bottom-right key. Omitted, the slot stays empty rather than collapsing. */
  action?: KeypadAction;
  /** Height of a key. The wake screen deliberately uses a larger one. */
  keyHeight?: number;
  style?: StyleProp<ViewStyle>;
};

const ROWS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

/**
 * The numeric keypad, shared by the time input and the wake challenge.
 *
 * One component for both is the point: it is the control the product is
 * operated with half-asleep, so it gets one set of key sizes, one press
 * behaviour, and one accessibility contract rather than two that drift apart.
 *
 * The system keyboard is never used. It covers half the screen, animates in,
 * and on the wake screen would put the challenge behind an IME — the keys are
 * the interface, not a fallback for it.
 */
export function Keypad({
  onDigit,
  onBackspace,
  isDigitDisabled,
  action,
  keyHeight = 60,
  style,
}: Props) {
  return (
    <View style={[styles.pad, style]}>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((digit) => (
            <KeypadKey
              key={digit}
              height={keyHeight}
              onPress={() => onDigit(digit)}
              disabled={isDigitDisabled?.(digit)}
              accessibilityLabel={String(digit)}>
              <Text style={[styles.digit, { fontSize: keyHeight * 0.45 }]}>{digit}</Text>
            </KeypadKey>
          ))}
        </View>
      ))}

      <View style={styles.row}>
        <KeypadKey height={keyHeight} onPress={onBackspace} accessibilityLabel="Delete last digit">
          <MaterialIcons name="backspace" size={keyHeight * 0.34} color={Color.textSecondary} />
        </KeypadKey>

        <KeypadKey
          height={keyHeight}
          onPress={() => onDigit(0)}
          disabled={isDigitDisabled?.(0)}
          accessibilityLabel="0">
          <Text style={[styles.digit, { fontSize: keyHeight * 0.45 }]}>0</Text>
        </KeypadKey>

        {action ? (
          <KeypadKey
            height={keyHeight}
            onPress={action.onPress}
            disabled={action.disabled}
            tone={action.tone ?? 'accent'}
            accessibilityLabel={action.label}>
            {action.icon ? (
              <MaterialIcons
                name={action.icon}
                size={keyHeight * 0.4}
                color={action.tone === 'neutral' ? Color.textSecondary : Color.magenta}
              />
            ) : (
              <Text style={styles.actionLabel}>{action.label.toUpperCase()}</Text>
            )}
          </KeypadKey>
        ) : (
          // Held open so the 0 key stays in the middle column where a thumb
          // expects it, rather than sliding across when there is no action.
          <View style={styles.emptySlot} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  digit: {
    fontFamily: FontFamily.monoMedium,
    color: Color.textPrimary,
  },
  actionLabel: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 13,
    letterSpacing: 1,
    color: Color.magenta,
  },
  emptySlot: {
    flex: 1,
  },
});
