import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Color, Radius } from '@/design/tokens';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const KNOB = 24;
const PADDING = 3;
const TRAVEL = TRACK_WIDTH - KNOB - PADDING * 2;

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/**
 * An on/off switch sized for a thumb rather than for the platform minimum.
 *
 * Hand-built rather than React Native's `Switch` so it carries the design's
 * palette; the accessibility contract is kept identical — a `switch` role and a
 * checked state — so a screen reader announces it exactly as the native control
 * would. The 52×30 track sits inside a 48dp-tall press area.
 */
export function Toggle({ value, onValueChange, accessibilityLabel }: Props) {
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [value, position]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      style={styles.pressArea}>
      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <Animated.View
          style={[
            styles.knob,
            value ? styles.knobOn : styles.knobOff,
            { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressArea: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: Radius.pill,
    padding: PADDING,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trackOn: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  trackOff: {
    backgroundColor: Color.cardElevated,
    borderColor: Color.border,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: Radius.pill,
  },
  knobOn: {
    backgroundColor: Color.magenta,
  },
  knobOff: {
    backgroundColor: Color.textMuted,
  },
});
