import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Color, Layout, Radius } from '@/design/tokens';

type Props = {
  children: ReactNode;
  onPress: () => void;
  height: number;
  disabled?: boolean;
  tone?: 'default' | 'accent' | 'neutral';
  accessibilityLabel: string;
};

/**
 * One key. Split out from the pad so the press behaviour — the fill change and
 * the haptic tick — is defined exactly once.
 *
 * The haptic matters more than it looks: a user solving math in the dark, with
 * the screen at its dimmest, needs to know a key registered without reading the
 * display, and a failed haptic must never stop the key working.
 */
export function KeypadKey({
  children,
  onPress,
  height,
  disabled,
  tone = 'default',
  accessibilityLabel,
}: Props) {
  const press = () => {
    void Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: Color.borderStrong }}
      style={({ pressed }) => [
        styles.key,
        { height: Math.max(height, Layout.minTouch) },
        tone === 'accent' && styles.accent,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Color.cardElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  accent: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  pressed: {
    backgroundColor: Color.borderStrong,
  },
  disabled: {
    // Still rendered, still in the layout, just clearly unavailable — a key
    // that vanished would move every other key under the user's thumb.
    opacity: 0.28,
  },
});
