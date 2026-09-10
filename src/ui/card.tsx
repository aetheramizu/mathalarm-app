import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * The one surface every list row, panel and summary sits on.
 *
 * A pressed card changes its fill rather than its size: a transform would move
 * the rows around it, and the Stitch reference's neon drop-shadow is a CSS
 * effect that costs real frames to approximate on Android for no information
 * gained.
 */
export function Card({ children, style, onPress, accessibilityLabel, accessibilityHint }: Props) {
  if (!onPress) {
    return <View style={[styles.card, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: Color.borderStrong }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    padding: Space.md,
    overflow: 'hidden',
  },
  pressed: {
    backgroundColor: Color.cardElevated,
  },
});
