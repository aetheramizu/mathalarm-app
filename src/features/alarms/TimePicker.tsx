import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';
import { FontFamily } from '@/design/typography';

/**
 * Height of each row in density-independent pixels.
 * Also the snap interval and the basis of all offset calculations.
 */
const ITEM_HEIGHT = 52;

/** Total visible rows on screen. Odd, so there is one true center row. */
const VISIBLE_ITEMS = 5;
const PADDING_ITEMS = (VISIBLE_ITEMS - 1) / 2;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type Props = {
  /** 24-hour format: 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
  onChange: (time: { hour: number; minute: number }) => void;
};

/**
 * Strictly 24-hour time picker with two independent wheels: Hour (00–23) and Minute (00–59).
 *
 * Designed with deterministic index <-> value mapping, zero looping/teleportation artifacts,
 * native deceleration momentum, and reliable settling physics.
 */
export function TimePicker({ hour, minute, onChange }: Props) {
  const latestHour = useRef(hour);
  const latestMinute = useRef(minute);
  latestHour.current = hour;
  latestMinute.current = minute;

  const onSelectHour = useCallback(
    (nextHour: number) => {
      latestHour.current = nextHour;
      onChange({ hour: nextHour, minute: latestMinute.current });
    },
    [onChange]
  );

  const onSelectMinute = useCallback(
    (nextMinute: number) => {
      latestMinute.current = nextMinute;
      onChange({ hour: latestHour.current, minute: nextMinute });
    },
    [onChange]
  );

  return (
    <View style={styles.wheels}>
      {/* Selection band behind the center row */}
      <View pointerEvents="none" style={styles.band} />

      <Wheel
        label="Hour"
        items={HOURS}
        value={hour}
        onSelect={onSelectHour}
        width={84}
      />
      <Text style={styles.separator}>:</Text>
      <Wheel
        label="Minute"
        items={MINUTES}
        value={minute}
        onSelect={onSelectMinute}
        width={84}
      />
    </View>
  );
}

type WheelProps = {
  label: string;
  items: string[];
  value: number;
  onSelect: (index: number) => void;
  width: number;
};

function Wheel({ label, items, value, onSelect, width }: WheelProps) {
  const count = items.length;
  const clampedValue = Math.max(0, Math.min(count - 1, value));

  // Seeded so initial mount is immediately on the right row with zero layout lag
  const initialOffset = useRef(clampedValue * ITEM_HEIGHT).current;
  const scrollY = useRef(new Animated.Value(initialOffset)).current;
  const scrollRef = useRef<ScrollView>(null);

  const currentValueRef = useRef(clampedValue);
  const currentOffset = useRef(initialOffset);
  const isDragging = useRef(false);
  const isMomentum = useRef(false);
  const dragEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when prop value changes from the outside (e.g. form opening/switching alarms)
  useEffect(() => {
    if (clampedValue !== currentValueRef.current) {
      currentValueRef.current = clampedValue;
      currentOffset.current = clampedValue * ITEM_HEIGHT;
      scrollRef.current?.scrollTo({ y: clampedValue * ITEM_HEIGHT, animated: false });
    }
  }, [clampedValue]);

  useEffect(() => {
    return () => {
      if (dragEndTimer.current) {
        clearTimeout(dragEndTimer.current);
      }
    };
  }, []);

  const settle = useCallback(
    (animated: boolean) => {
      if (isDragging.current || isMomentum.current) return;

      const rawIndex = currentOffset.current / ITEM_HEIGHT;
      const targetIndex = Math.max(0, Math.min(count - 1, Math.round(rawIndex)));
      const targetOffset = targetIndex * ITEM_HEIGHT;

      // Ensure the wheel physically aligns precisely to the exact row pixel
      if (Math.abs(currentOffset.current - targetOffset) > 0.5) {
        scrollRef.current?.scrollTo({ y: targetOffset, animated });
      }

      if (targetIndex !== currentValueRef.current) {
        currentValueRef.current = targetIndex;
        void Haptics.selectionAsync().catch(() => {});
        onSelect(targetIndex);
      }
    },
    [count, onSelect]
  );

  const onScrollBeginDrag = useCallback(() => {
    isDragging.current = true;
    isMomentum.current = false;
    if (dragEndTimer.current) {
      clearTimeout(dragEndTimer.current);
      dragEndTimer.current = null;
    }
  }, []);

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      currentOffset.current = e.nativeEvent.contentOffset.y;
      const velocity = e.nativeEvent.velocity?.y ?? 0;

      if (dragEndTimer.current) {
        clearTimeout(dragEndTimer.current);
        dragEndTimer.current = null;
      }

      // If released with virtually no velocity, Android won't trigger momentum.
      // Settle immediately so slow short drags snap predictably.
      if (Math.abs(velocity) < 0.1) {
        settle(true);
        return;
      }

      // Safety timeout: if velocity was reported but momentum doesn't fire
      // (e.g. hitting edge boundaries), ensure it settles cleanly.
      dragEndTimer.current = setTimeout(() => {
        dragEndTimer.current = null;
        if (!isDragging.current && !isMomentum.current) {
          settle(true);
        }
      }, 120);
    },
    [settle]
  );

  const onMomentumScrollBegin = useCallback(() => {
    isMomentum.current = true;
    if (dragEndTimer.current) {
      clearTimeout(dragEndTimer.current);
      dragEndTimer.current = null;
    }
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isMomentum.current = false;
      if (dragEndTimer.current) {
        clearTimeout(dragEndTimer.current);
        dragEndTimer.current = null;
      }
      currentOffset.current = e.nativeEvent.contentOffset.y;
      settle(true);
    },
    [settle]
  );

  const trackScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentOffset.current = e.nativeEvent.contentOffset.y;
  }, []);

  const pressRow = useCallback(
    (targetIndex: number) => {
      if (isDragging.current || isMomentum.current) return;
      if (targetIndex < 0 || targetIndex >= count) return;
      if (targetIndex === currentValueRef.current) return;

      void Haptics.selectionAsync().catch(() => {});
      currentValueRef.current = targetIndex;
      scrollRef.current?.scrollTo({ y: targetIndex * ITEM_HEIGHT, animated: true });
      onSelect(targetIndex);
    },
    [count, onSelect]
  );

  const step = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(count - 1, currentValueRef.current + delta));
      if (next === currentValueRef.current) return;

      void Haptics.selectionAsync().catch(() => {});
      currentValueRef.current = next;
      scrollRef.current?.scrollTo({ y: next * ITEM_HEIGHT, animated: true });
      onSelect(next);
    },
    [count, onSelect]
  );

  return (
    <View
      style={[styles.wheel, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count - 1, now: clampedValue, text: items[clampedValue] }}
      accessibilityActions={ADJUST_ACTIONS}
      onAccessibilityAction={({ nativeEvent }) => {
        step(nativeEvent.actionName === 'increment' ? 1 : -1);
      }}>
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: initialOffset }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="normal"
        disableIntervalMomentum={false}
        nestedScrollEnabled
        contentContainerStyle={styles.wheelContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: trackScroll,
        })}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}>
        {items.map((text, index) => (
          <WheelItem
            key={index}
            row={index}
            text={text}
            scrollY={scrollY}
            onPress={pressRow}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const WheelItem = React.memo(function WheelItem({
  row,
  text,
  scrollY,
  onPress,
}: {
  row: number;
  text: string;
  scrollY: Animated.Value;
  onPress: (row: number) => void;
}) {
  const inputRange = [
    (row - 2) * ITEM_HEIGHT,
    (row - 1) * ITEM_HEIGHT,
    row * ITEM_HEIGHT,
    (row + 1) * ITEM_HEIGHT,
    (row + 2) * ITEM_HEIGHT,
  ];

  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.55, 0.72, 1, 0.72, 0.55],
    extrapolate: 'clamp',
  });
  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.2, 0.45, 1, 0.45, 0.2],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.item, { opacity, transform: [{ scale }] }]}>
      <Pressable
        onPress={() => onPress(row)}
        style={styles.itemHit}
        importantForAccessibility="no-hide-descendants">
        <Text style={styles.itemText}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
});

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

const styles = StyleSheet.create({
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_HEIGHT,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PADDING_ITEMS * ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.borderStrong,
  },
  wheel: {
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    paddingVertical: PADDING_ITEMS * ITEM_HEIGHT,
  },
  item: {
    height: ITEM_HEIGHT,
  },
  itemHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontFamily: FontFamily.monoBold,
    fontSize: 38,
    lineHeight: ITEM_HEIGHT,
    letterSpacing: -1,
    color: Color.textPrimary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  separator: {
    fontFamily: FontFamily.monoBold,
    fontSize: 32,
    lineHeight: ITEM_HEIGHT,
    color: Color.textSecondary,
    paddingHorizontal: Space.sm,
  },
});
