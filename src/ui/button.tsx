import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Color, Layout, PrimaryGradient, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/**
 * The primary action, and the only place the peach → magenta → purple gradient
 * appears on a screen.
 *
 * Keeping it to one control per screen is what makes it read as *the* action;
 * the reference design puts the same gradient on four things at once, which
 * flattens the hierarchy it was meant to create.
 */
export function PrimaryButton({ label, onPress, icon, disabled, style, accessibilityHint }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.wrap, disabled && styles.disabled, pressed && styles.pressed, style]}>
      <LinearGradient
        colors={PrimaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}>
        {icon ? (
          <MaterialIcons name={icon} size={22} color={Color.textPrimary} accessibilityElementsHidden />
        ) : null}
        <Text style={[Type.titleLg, styles.primaryLabel]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Everything that is a real choice but not the recommended one: cancel, and the
 * secondary half of a pair. Flat, bordered, and deliberately quieter.
 */
export function SecondaryButton({ label, onPress, icon, disabled, style, accessibilityHint }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: Color.borderStrong }}
      style={({ pressed }) => [
        styles.wrap,
        styles.secondary,
        disabled && styles.disabled,
        pressed && styles.secondaryPressed,
        style,
      ]}>
      <View style={styles.fill}>
        {icon ? (
          <MaterialIcons name={icon} size={20} color={Color.textSecondary} accessibilityElementsHidden />
        ) : null}
        <Text style={[Type.titleLg, styles.secondaryLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * A destructive action. Never the default, never the one your thumb lands on
 * first, and always paired with a confirmation by its caller.
 */
export function DangerButton({ label, onPress, icon, disabled, style, accessibilityHint }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: 'rgba(255, 90, 95, 0.25)' }}
      style={({ pressed }) => [
        styles.wrap,
        styles.danger,
        disabled && styles.disabled,
        pressed && styles.dangerPressed,
        style,
      ]}>
      <View style={styles.fill}>
        {icon ? (
          <MaterialIcons name={icon} size={20} color={Color.danger} accessibilityElementsHidden />
        ) : null}
        <Text style={[Type.titleLg, styles.dangerLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 56,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.lg,
    minHeight: Layout.minTouch,
  },
  // Opacity rather than scale: a shrinking pill nudges the list below it.
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  primaryLabel: {
    color: Color.textPrimary,
  },
  secondary: {
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.borderStrong,
  },
  secondaryPressed: {
    backgroundColor: Color.cardElevated,
  },
  secondaryLabel: {
    color: Color.textSecondary,
  },
  danger: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 90, 95, 0.4)',
  },
  dangerPressed: {
    backgroundColor: 'rgba(255, 90, 95, 0.1)',
  },
  dangerLabel: {
    color: Color.danger,
  },
});
