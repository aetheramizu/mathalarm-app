import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextStyle,
} from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';
import { FontFamily } from '@/design/typography';

/**
 * Time entry as three scrolling wheels: hour, minute, AM/PM.
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
 *
 * ## Twelve hours on the outside, twenty-four on the inside
 *
 * The wheels read 1–12 with a meridiem beside them, which is how the user reads
 * a clock. Everything behind this component — the alarm row, the scheduler, the
 * database — stays on the 24-hour clock it has always used, because that is the
 * only representation in which "is 00:30 before or after 12:30" has one answer.
 * The conversion lives here and nowhere else.
 *
 * ## Where this component may be mounted
 *
 * Each wheel is a vertical scroller, so this must not be placed inside another
 * vertical scroller: on Android the outer one intercepts the drag and the
 * wheels simply do not move. It belongs in the sheet's pinned header, which is
 * exactly what that slot exists for.
 */

/** One row. Also the snap interval, and the unit every offset is measured in. */
const ITEM_HEIGHT = 52;
/** Rows visible at once. Odd, so there is a true centre with two rows either side. */
const VISIBLE_ITEMS = 5;
const PADDING_ITEMS = (VISIBLE_ITEMS - 1) / 2;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

/**
 * Below this, Android will not start a fling — the gesture is over the moment
 * the finger leaves the glass.
 *
 * In density-independent pixels per second, which is the unit React Native
 * reports scroll velocity in on Android (it runs the raw pixel value through
 * `toDIPFromPixel` on the way out). That matters, because the platform's own
 * `ViewConfiguration.getMinimumFlingVelocity` is 50 in those same units: the
 * threshold has to sit safely *under* it, or a release that was about to be
 * carried further gets stopped dead instead.
 */
const FLING_VELOCITY = 40;

/**
 * The fallback wait for a release too fast to settle on the spot but which
 * turns out not to fling after all. Cancelled the moment momentum is reported,
 * which is almost always what happens instead.
 */
const SETTLE_GRACE_MS = 60;

/**
 * How much runway a looping wheel keeps on each side of the row it is resting
 * on, in rows.
 *
 * A hard fling on a 52dp wheel covers well under this, so the user can never
 * reach either end of the strip before it is silently recentred — which is the
 * whole illusion. See `bandsFor`.
 */
const LOOP_RUNWAY_ROWS = 40;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const MERIDIEMS = ['AM', 'PM'];

/** Index into `HOURS` for twelve o'clock — the row either side of which the day flips. */
const TWELVE = 11;
/** Index into `HOURS` for eleven o'clock. */
const ELEVEN = 10;

const PM = 1;

type Props = {
  /** On the 24-hour clock, 0–23, exactly as the alarm stores it. */
  hour: number;
  minute: number;
  onChange: (time: { hour: number; minute: number }) => void;
};

export function TimePicker({ hour, minute, onChange }: Props) {
  const hourIndex = to12HourIndex(hour);
  const meridiemIndex = hour >= 12 ? PM : 0;

  /**
   * A real clock face flips from morning to afternoon as it passes twelve, and
   * nowhere else. So the meridiem follows the hour wheel across the 11/12
   * boundary in either direction, and stays put for every other move —
   * including the wrap from twelve round to one, which on a real dial is an
   * hour into the same half of the day, not out of it.
   *
   * Only an *adjacent* step counts. A fling from three o'clock that lands on
   * twelve never travelled through eleven, and a dial that was not turned past
   * the top has not changed the half of the day it is in.
   */
  const selectHour = (nextIndex: number) => {
    const crossedTwelve =
      (hourIndex === ELEVEN && nextIndex === TWELVE) ||
      (hourIndex === TWELVE && nextIndex === ELEVEN);
    const nextMeridiem = crossedTwelve ? 1 - meridiemIndex : meridiemIndex;
    onChange({ hour: to24Hour(nextIndex, nextMeridiem), minute });
  };

  return (
    <View style={styles.wheels}>
      {/*
        The selection band, drawn once behind all three wheels rather than as
        part of any of them. It is what makes the centre row read as "the value"
        while the rows above and below are visibly the neighbours you could
        scroll to, and it stays put while they move.
      */}
      <View pointerEvents="none" style={styles.band} />

      <Wheel label="Hour" items={HOURS} index={hourIndex} onSelect={selectHour} width={72} loop />
      <Text style={styles.separator}>:</Text>
      <Wheel
        label="Minute"
        items={MINUTES}
        index={minute}
        onSelect={(next) => onChange({ hour, minute: next })}
        width={72}
        loop
      />
      {/*
        The meridiem does not loop. There are two of them; a wheel that can be
        flung endlessly between two values is a fidget, not a control, and the
        pair is short enough that both are on screen at once anyway.
      */}
      <Wheel
        label="AM or PM"
        items={MERIDIEMS}
        index={meridiemIndex}
        onSelect={(next) => onChange({ hour: to24Hour(hourIndex, next), minute })}
        width={64}
        textStyle={styles.meridiemText}
      />
    </View>
  );
}

/** 0–23 to a row on the 1–12 wheel. Midnight and noon are both "12". */
function to12HourIndex(hour24: number): number {
  const hour12 = hour24 % 12;
  return hour12 === 0 ? TWELVE : hour12 - 1;
}

/** A row on the 1–12 wheel plus a meridiem, back to 0–23. */
function to24Hour(hourIndex: number, meridiemIndex: number): number {
  const hour12 = hourIndex + 1;
  const base = hour12 === 12 ? 0 : hour12;
  return meridiemIndex === PM ? base + 12 : base;
}

/**
 * How many copies of the value list a looping wheel lays end to end.
 *
 * An endless wheel is really a long finite one that jumps back to the middle
 * whenever the user stops. Always an odd number of copies, so there *is* a
 * middle copy to jump back to, and enough copies either side of it that no
 * fling can reach an end before that jump happens.
 */
function bandsFor(count: number, loop: boolean): number {
  if (!loop) return 1;
  return 1 + 2 * Math.ceil(LOOP_RUNWAY_ROWS / count);
}

/** Wraps any row on the strip back to the value it is showing. */
function valueOfRow(row: number, count: number): number {
  return ((row % count) + count) % count;
}

type WheelProps = {
  label: string;
  /** What each row reads. The value is the row's position in here. */
  items: string[];
  index: number;
  onSelect: (index: number) => void;
  width: number;
  /** Whether the wheel runs on forever, wrapping from the last value to the first. */
  loop?: boolean;
  textStyle?: TextStyle;
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
 *
 * ## Two ways to use it
 *
 * Dragging is the primary one. But a neighbour of the selected row can also
 * simply be tapped, which is faster and steadier than a drag for the very
 * common case of being one value out. Only the immediate neighbours are
 * tappable: a tap that jumped four rows would be a different gesture with a
 * different meaning, and a wheel where any visible row is a button stops
 * reading as a wheel.
 */
function Wheel({ label, items, index, onSelect, width, loop = false, textStyle }: WheelProps) {
  const count = items.length;
  const bands = bandsFor(count, loop);

  /** The row the middle copy of the list starts at — always a multiple of `count`. */
  const middleBase = Math.floor(bands / 2) * count;

  const rows = useMemo(
    () => Array.from({ length: count * bands }, (_, row) => items[valueOfRow(row, count)]),
    [items, count, bands]
  );

  // Seeded so the very first frame is already at the right row: the wheel
  // mounts with the sheet, and starting at zero would show a visible scroll up
  // to the alarm's real time every time the form opens.
  const initialRow = middleBase + clampRow(index, count);
  const initialOffset = useRef(initialRow * ITEM_HEIGHT).current;
  const scrollY = useRef(new Animated.Value(initialOffset)).current;
  const scrollRef = useRef<ScrollView>(null);

  /**
   * The row on the strip this wheel believes it is resting on.
   *
   * Rows rather than values, because a looping wheel has many rows per value
   * and the difference is what decides whether it needs recentring — and what
   * makes "the row above the current one" a question with an answer.
   *
   * It also tells a change that came from the outside — the meridiem being
   * flipped by the hour wheel — apart from one this wheel just made itself.
   * Only the former should move the scroller under the user.
   */
  const settledRow = useRef(initialRow);

  /**
   * The offset the wheel is at right now, kept fresh by every scroll event.
   *
   * `settle` needs the live offset rather than the one captured when a drag
   * ended, because it may run a frame or two later — and it is the offset, not
   * the row, that says whether the value is actually sitting in the band.
   */
  const offset = useRef(initialOffset);

  const flinging = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimers = () => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    if (snapTimer.current !== null) clearTimeout(snapTimer.current);
    settleTimer.current = null;
    snapTimer.current = null;
  };

  useEffect(() => cancelTimers, []);

  const recenterAfterSnap = (row: number, value: number) => {
    if (!loop) return;
    const home = middleBase + value;
    if (home !== row) {
      snapTimer.current = setTimeout(() => {
        snapTimer.current = null;
        if (flinging.current) return;
        moveToRow(home, false);
      }, 400);
    }
  };

  const moveToRow = (row: number, animated: boolean) => {
    settledRow.current = row;
    offset.current = row * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: row * ITEM_HEIGHT, animated });
  };

  // Follows the prop when something else moved it — the meridiem being flipped
  // by the hour wheel crossing twelve. Never reports back: the value is already
  // whatever the parent just set it to, and answering would be an echo.
  useEffect(() => {
    if (valueOfRow(settledRow.current, count) === index) return;
    moveToRow(middleBase + index, true);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The only thing JavaScript does while the wheel is moving: remember where it
   * is. The scaling and dimming are already running natively, and this has to
   * stay this cheap — the wheel used to buzz once per value crossed, which was
   * a bridge call every 45ms during a fling and made the scroll feel worse than
   * the tick was worth.
   */
  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    settledRow.current = clampRow(offset.current / ITEM_HEIGHT, rows.length);
  };

  /**
   * Brings the wheel to rest with the nearest value centred in the band, and
   * commits it.
   *
   * With native snap properties removed to preserve smooth deceleration, this
   * is what provides the precise stop. If the wheel naturally settled slightly
   * off a row, it smoothly animates to the exact centre, then silently jumps
   * back to the middle of the loop runway once that snap finishes.
   */
  const settle = () => {
    const row = clampRow(offset.current / ITEM_HEIGHT, rows.length);
    const value = valueOfRow(row, count);
    settledRow.current = row;
    if (value !== index) onSelect(value);

    const isExact = Math.abs(offset.current - row * ITEM_HEIGHT) < 0.5;

    if (isExact) {
      if (loop) {
        const home = middleBase + value;
        if (home !== row) moveToRow(home, false);
      }
      return;
    }

    moveToRow(row, true);
    recenterAfterSnap(row, value);
  };

  /**
   * A released drag either hands off to a fling or ends the gesture there.
   *
   * The velocity Android reports with the release says which, and that is worth
   * reading rather than waiting to find out: a slow release is exactly the case
   * the platform will not snap, and making the user watch a timer expire before
   * the value drops into the band is the delay that made this feel unfinished.
   * Below the fling threshold the gesture is over, so the wheel settles on the
   * spot, in the same frame the finger lifts.
   *
   * Above it, settling now would kill a fling that is about to start, so the
   * wheel leaves the job to `onMomentumScrollEnd` — with a short timer behind
   * it in case the fling never materialises. Momentum beginning cancels it.
   */
  const onDragEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    cancelTimers();
    offset.current = event.nativeEvent.contentOffset.y;

    if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < FLING_VELOCITY) {
      settle();
      return;
    }

    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (flinging.current) return;
      settle();
    }, SETTLE_GRACE_MS);
  };

  /** A tap on the row directly above or below the selected one. */
  const pressRow = (row: number) => {
    if (Math.abs(row - settledRow.current) !== 1) return;
    void Haptics.selectionAsync().catch(() => {});
    cancelTimers();
    moveToRow(row, true);
    const value = valueOfRow(row, count);
    onSelect(value);
    recenterAfterSnap(row, value);
  };

  /** Steps the wheel for a screen reader, which never performs the drag. */
  const step = (delta: number) => {
    const next = settledRow.current + delta;
    if (next < 0 || next >= rows.length) return;
    cancelTimers();
    moveToRow(next, true);
    const value = valueOfRow(next, count);
    onSelect(value);
    recenterAfterSnap(next, value);
  };

  return (
    <View
      style={[styles.wheel, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count - 1, now: index, text: items[index] }}
      accessibilityActions={ADJUST_ACTIONS}
      onAccessibilityAction={({ nativeEvent }) => {
        step(nativeEvent.actionName === 'increment' ? 1 : -1);
      }}>
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: initialOffset }}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        // Belt and braces. The wheel is meant to live outside any other
        // scroller, but if one ever ends up above it, this is what lets Android
        // hand the drag down here instead of eating it.
        nestedScrollEnabled
        // The rows are a fixed 52dp tall and there are a couple of hundred of
        // them at most; the whole strip is cheap to lay out at once, and
        // virtualising it would cost the native scaling its input range and the
        // loop its silent recentring.
        contentContainerStyle={styles.wheelContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: trackScroll,
        })}
        onScrollBeginDrag={() => {
          flinging.current = false;
          cancelTimers();
        }}
        onScrollEndDrag={onDragEnd}
        onMomentumScrollBegin={() => {
          flinging.current = true;
          cancelTimers();
        }}
        onMomentumScrollEnd={() => {
          flinging.current = false;
          settle();
        }}>
        {rows.map((text, row) => (
          <WheelItem
            key={row}
            row={row}
            text={text}
            scrollY={scrollY}
            onPress={pressRow}
            textStyle={textStyle}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * One row of one wheel.
 *
 * Size and dimming both come from the distance to the centre, which is exactly
 * what the scroll offset already encodes — the row at offset `row *
 * ITEM_HEIGHT` is the selected one, and every row away from it is a step down
 * the ramp.
 *
 * `scale` rather than `fontSize` because only transforms and opacity run on the
 * native driver; a font size animated from JavaScript would stutter under the
 * very fling it is meant to illustrate.
 *
 * Every row is pressable, and the wheel decides whether a given press means
 * anything — the alternative is re-rendering two hundred rows on every scroll
 * just to keep track of which three are currently neighbours.
 */
function WheelItem({
  row,
  text,
  scrollY,
  onPress,
  textStyle,
}: {
  row: number;
  text: string;
  scrollY: Animated.Value;
  onPress: (row: number) => void;
  textStyle?: TextStyle;
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
        selected value and steps through them on request, and two hundred
        readable rows would bury both.
      */}
      <Pressable
        onPress={() => onPress(row)}
        style={styles.itemHit}
        importantForAccessibility="no-hide-descendants">
        <Text style={[styles.itemText, textStyle]}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function clampRow(row: number, length: number): number {
  if (!Number.isFinite(row)) return 0;
  return Math.min(length - 1, Math.max(0, Math.round(row)));
}

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
    // Android otherwise reserves vertical padding inside the text box, which
    // pushes the glyph off the centre of its 52dp row.
    includeFontPadding: false,
    textAlign: 'center',
  },
  // Two letters rather than two digits, so it needs its own size to sit on the
  // same optical line as the numbers instead of overrunning its column.
  meridiemText: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  separator: {
    fontFamily: FontFamily.monoBold,
    fontSize: 32,
    lineHeight: ITEM_HEIGHT,
    color: Color.textSecondary,
    paddingHorizontal: Space.xxs,
  },
});
