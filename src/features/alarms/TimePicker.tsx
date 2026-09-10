import * as Haptics from 'expo-haptics';
import { useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';

/**
 * Time entry as two scrolling wheels, HH and MM on a 24-hour clock.
 *
 * This replaces the four-digit keypad the form used to carry. The keypad was
 * unambiguous, but it was four deliberate taps to say "07:30" and it read as a
 * form field rather than as a clock — every alarm on the platform is a wheel,
 * and matching that is what makes the control feel native rather than merely
 * correct.
 *
 * What the keypad was right about is kept: an invalid time still cannot be
 * expressed, because the wheels contain only real hours and real minutes, so
 * there is no validation and no error message here either. The accessible
 * fallback the keypad gave for free is provided explicitly instead — each wheel
 * is an adjustable, so a screen reader steps it one value at a time and never
 * has to perform a drag.
 */

/** One row. Also the snap interval, and the unit every offset is measured in. */
const ITEM_HEIGHT = 52;
/** Rows visible at once. Odd, so there is a true centre with two rows either side. */
const VISIBLE_ITEMS = 5;
const PADDING_ITEMS = (VISIBLE_ITEMS - 1) / 2;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

/**
 * A tick per value crossed is what a physical wheel does, and it is how the
 * user knows a fling landed somewhere without reading it. A fast fling crosses
 * sixty values, though, so the ticks are rate-limited to something the motor
 * can actually reproduce.
 */
const HAPTIC_INTERVAL_MS = 45;

type Props = {
  hour: number;
  minute: number;
  onChange: (time: { hour: number; minute: number }) => void;
};

export function TimePicker({ hour, minute, onChange }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.wheels}>
        {/*
          The selection band, drawn once behind both wheels rather than as part
          of either. It is what makes the centre row read as "the value" while
          the rows above and below are visibly the neighbours you could scroll
          to, and it stays put while they move.
        */}
        <View pointerEvents="none" style={styles.band} />

        <Wheel
          label="Hour"
          count={24}
          value={hour}
          onSelect={(next) => onChange({ hour: next, minute })}
        />
        <Text style={styles.separator}>:</Text>
        <Wheel
          label="Minute"
          count={60}
          value={minute}
          onSelect={(next) => onChange({ hour, minute: next })}
        />
      </View>

      <Text style={[Type.labelSm, styles.hint]}>24-HOUR CLOCK</Text>
    </View>
  );
}

type WheelProps = {
  label: string;
  /** Values run 0 to `count - 1`. */
  count: number;
  value: number;
  onSelect: (value: number) => void;
};

/**
 * One column.
 *
 * The scaling and dimming of the rows is driven from the scroll offset on the
 * native side — one `Animated.Value`, `useNativeDriver`, an interpolation per
 * row — so the wheel keeps moving under a thumb whatever JavaScript is doing.
 * Nothing here re-renders while it scrolls.
 *
 * The value is therefore committed only when the wheel comes to rest, at the
 * end of a drag and at the end of the momentum that may follow it. Rounding the
 * offset to the nearest row makes those two agree: at the end of a drag the
 * rounded row is the one snapping is on its way to, which is the same row the
 * momentum will finish at.
 */
function Wheel({ label, count, value, onSelect }: WheelProps) {
  const values = useMemo(() => Array.from({ length: count }, (_, index) => index), [count]);

  // Seeded so the very first frame is already at the right row: the wheel
  // mounts with the sheet, and starting at zero would show a visible scroll up
  // to the alarm's real time every time the form opens.
  const initialOffset = useRef(clampIndex(value, count) * ITEM_HEIGHT).current;
  const scrollY = useRef(new Animated.Value(initialOffset)).current;
  const scrollRef = useRef<ScrollView>(null);

  const lastTickIndex = useRef(clampIndex(value, count));
  const lastTickAt = useRef(0);

  const indexAt = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    clampIndex(event.nativeEvent.contentOffset.y / ITEM_HEIGHT, count);

  const tick = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAt(event);
    if (index === lastTickIndex.current) return;
    lastTickIndex.current = index;

    const now = Date.now();
    if (now - lastTickAt.current < HAPTIC_INTERVAL_MS) return;
    lastTickAt.current = now;
    void Haptics.selectionAsync().catch(() => {});
  };

  const commit = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAt(event);
    lastTickIndex.current = index;
    if (index !== value) onSelect(index);
  };

  /** Steps the wheel for a screen reader, which never performs the drag. */
  const step = (delta: number) => {
    const next = clampIndex(value + delta, count);
    if (next === value) return;
    scrollRef.current?.scrollTo({ y: next * ITEM_HEIGHT, animated: true });
    onSelect(next);
  };

  return (
    <View
      style={styles.wheel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count - 1, now: value, text: pad(value) }}
      accessibilityActions={ADJUST_ACTIONS}
      onAccessibilityAction={({ nativeEvent }) => {
        step(nativeEvent.actionName === 'increment' ? 1 : -1);
      }}>
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: initialOffset }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        // The rows are a fixed 52dp tall and there are at most sixty of them, so
        // the whole column is cheap to lay out at once; virtualising it would
        // buy nothing and cost the native scaling its input range.
        contentContainerStyle={styles.wheelContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: tick,
        })}
        onScrollEndDrag={commit}
        onMomentumScrollEnd={commit}>
        {values.map((item) => (
          <WheelItem key={item} index={item} scrollY={scrollY} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * One row of one wheel.
 *
 * Size and dimming both come from the distance to the centre, which is exactly
 * what the scroll offset already encodes — the row at offset `index *
 * ITEM_HEIGHT` is the selected one, and every row away from it is a step down
 * the ramp.
 *
 * `scale` rather than `fontSize` because only transforms and opacity run on the
 * native driver; a font size animated from JavaScript would stutter under the
 * very fling it is meant to illustrate.
 */
function WheelItem({ index, scrollY }: { index: number; scrollY: Animated.Value }) {
  const inputRange = [
    (index - 2) * ITEM_HEIGHT,
    (index - 1) * ITEM_HEIGHT,
    index * ITEM_HEIGHT,
    (index + 1) * ITEM_HEIGHT,
    (index + 2) * ITEM_HEIGHT,
  ];

  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.5, 0.66, 1, 0.66, 0.5],
    extrapolate: 'clamp',
  });
  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.2, 0.45, 1, 0.45, 0.2],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.item, { opacity, transform: [{ scale }] }]}>
      {/*
        Hidden from the screen reader: the wheel around it already announces the
        selected value, and eighty-four readable rows would bury it.
      */}
      <Text style={styles.itemText} importantForAccessibility="no-hide-descendants">
        {pad(index)}
      </Text>
    </Animated.View>
  );
}

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function clampIndex(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const styles = StyleSheet.create({
  root: {
    gap: Space.xs,
  },
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
    width: 92,
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    paddingVertical: PADDING_ITEMS * ITEM_HEIGHT,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontFamily: FontFamily.monoBold,
    fontSize: 40,
    lineHeight: ITEM_HEIGHT,
    letterSpacing: -1,
    color: Color.textPrimary,
    // Android otherwise reserves vertical padding inside the text box, which
    // pushes the glyph off the centre of its 52dp row.
    includeFontPadding: false,
    textAlign: 'center',
  },
  separator: {
    fontFamily: FontFamily.monoBold,
    fontSize: 34,
    lineHeight: ITEM_HEIGHT,
    color: Color.textSecondary,
    paddingHorizontal: Space.xxs,
  },
  hint: {
    textAlign: 'center',
    color: Color.textMuted,
  },
});
