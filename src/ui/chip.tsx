import { StyleSheet, Text, View } from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';

export type ChipTone = 'neutral' | 'accent' | 'positive' | 'warning';

type Props = {
  label: string;
  tone?: ChipTone;
};

/**
 * A small, read-only status pill.
 *
 * Every tone carries its meaning in the words as well as the colour, because
 * colour alone is not a signal a half-awake user, or a colour-blind one, can
 * rely on. Magenta text is the lighter `magentaText` tint: the pure accent
 * fails 4.5:1 at this size on the void.
 */
export function Chip({ label, tone = 'neutral' }: Props) {
  return (
    <View style={[styles.chip, TONES[tone].container]}>
      <Text style={[Type.labelSm, TONES[tone].text]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const TONES = {
  neutral: {
    container: { backgroundColor: Color.cardElevated, borderColor: Color.border },
    text: { color: Color.textSecondary },
  },
  accent: {
    container: { backgroundColor: Color.magentaFill, borderColor: Color.magentaEdge },
    text: { color: Color.magentaText },
  },
  positive: {
    container: { backgroundColor: Color.cyanFill, borderColor: Color.cyanEdge },
    text: { color: Color.cyan },
  },
  warning: {
    container: { backgroundColor: 'rgba(255, 90, 95, 0.14)', borderColor: 'rgba(255, 90, 95, 0.4)' },
    text: { color: Color.danger },
  },
} as const;

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.xs,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
