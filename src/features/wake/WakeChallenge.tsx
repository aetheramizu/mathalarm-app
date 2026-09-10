import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Color, Layout, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';
import { Keypad } from '@/ui/keypad';
import { useReducedMotion } from '@/ui/motion';

import type { WakeProgress } from './machine';

type Props = {
  progress: WakeProgress;
  entry: string;
  wrongAt: number | null;
  /** True while the dismissal is in flight — the keypad is done, the alarm is stopping. */
  finishing: boolean;
  onDigit: (digit: number) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  onDevAbort: () => void;
};

/** How long a problem takes to swap. Short enough not to be a wait, long enough to be seen. */
const SWAP_MS = 220;

/**
 * The challenge itself.
 *
 * Everything on this screen is sized for someone who has just been woken by it:
 * the equation is the largest thing on the display, the keys are 64dp rather
 * than the 48dp platform minimum, and the whole thing is on screen the instant
 * the device wakes.
 *
 * There is no visible way out. No header, no tab bar, no cancel. Solving is the
 * only exit, which is the product.
 *
 * ## What the motion here is for
 *
 * The screen used to be entirely static, which made it read as a form rather
 * than as something happening to you, and — worse — made a wrong answer and a
 * correct one look almost identical: the equation simply became a different
 * equation. So there are exactly four moving things, and each is carrying
 * information rather than decoration:
 *
 * - the ringing dot pulses, because the alarm is still audibly going;
 * - the equation cross-fades when it is replaced, so a new problem is
 *   unmistakably a *new* problem;
 * - the answer field shakes once when the answer was wrong;
 * - the caret blinks, which is what a caret does.
 *
 * All four are opacity and transform only, all on the native driver, and all of
 * them are skipped when the device asks for reduced motion. Nothing here waits
 * on an animation to become usable — the keypad is live throughout.
 */
export function WakeChallenge({
  progress,
  entry,
  wrongAt,
  finishing,
  onDigit,
  onBackspace,
  onSubmit,
  onDevAbort,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  useAnswerHaptics(progress.stepIndex, wrongAt);

  const solvedLabel = `PROBLEM ${Math.min(progress.stepIndex + 1, progress.requiredProblems)} OF ${progress.requiredProblems}`;

  return (
    <View
      style={[
        styles.root,
        // The route runs immersive, so both insets read 0 once Android has
        // hidden the bars — but a punch-hole camera and a gesture pill are
        // still physically there. `Math.max` keeps a floor under both edges so
        // the label never lands behind a cutout and the keypad never sits on
        // the very lip of the display.
        {
          paddingTop: Math.max(insets.top, Space.lg) + Space.lg,
          paddingBottom: Math.max(insets.bottom, Space.md),
        },
      ]}>
      <AmbientWash />

      <Pressable
        // The only escape hatch, and it exists solely so a development build can
        // be tested without solving five hard problems. `onDevAbort` refuses in
        // any other build, and the hint is not rendered in one.
        onLongPress={onDevAbort}
        delayLongPress={2500}
        style={styles.header}>
        <RingingDot reducedMotion={reducedMotion} />
        <Text style={[Type.labelSm, styles.headerLabel]} numberOfLines={1}>
          {(progress.alarmLabel ?? 'ALARM').toUpperCase()}
        </Text>
        <RingTimer firedAt={progress.firedAt} />
      </Pressable>

      <ProgressRail
        total={progress.requiredProblems}
        done={progress.stepIndex}
        label={solvedLabel}
      />

      <View style={styles.stage}>
        <EquationSwap problemId={progress.problem.id} reducedMotion={reducedMotion}>
          <Text
            style={[Type.displayEquation, styles.equation]}
            adjustsFontSizeToFit
            numberOfLines={1}>
            {progress.problem.prompt}
          </Text>
        </EquationSwap>

        <AnswerField
          entry={entry}
          /*
            An arithmetic prompt reads "47 + 28" and the answer completes it, so
            the field is introduced with "=". A linear prompt already contains
            its own equals sign and asks for the unknown, so there it is "x =".
            Either way the answer is part of the equation rather than a form
            field parked underneath one.
          */
          lead={progress.problem.kind === 'linear' ? 'x =' : '='}
          wrongAt={wrongAt}
          finishing={finishing}
          reducedMotion={reducedMotion}
        />

        <StatusLine
          finishing={finishing}
          wrong={wrongAt !== null}
          wrongCount={progress.wrongCount}
        />
      </View>

      <Keypad
        keyHeight={Layout.wakeKey}
        onDigit={onDigit}
        onBackspace={onBackspace}
        isDigitDisabled={() => finishing}
        action={{
          label: 'Enter',
          onPress: onSubmit,
          disabled: finishing || entry === '',
        }}
      />
    </View>
  );
}

/**
 * The haptics for an answer landing.
 *
 * A wrong answer already buzzed; a correct one did not, which meant the two
 * outcomes were indistinguishable to a hand holding a phone that is still face
 * down on the bedside table. Both now announce themselves.
 *
 * The solved count is seeded from whatever it is on mount rather than from
 * zero. A challenge survives process death and comes back at the step it was
 * on, and buzzing three times for progress the user made before the crash would
 * be a lie about what just happened.
 */
function useAnswerHaptics(stepIndex: number, wrongAt: number | null) {
  const lastStep = useRef(stepIndex);

  useEffect(() => {
    if (wrongAt === null) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [wrongAt]);

  // The last correct answer advances the step too, on its way into the
  // dismissal, so this covers finishing the challenge as well as getting one
  // problem right — and covers each of them exactly once.
  useEffect(() => {
    if (stepIndex <= lastStep.current) return;
    lastStep.current = stepIndex;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [stepIndex]);
}

/**
 * A single soft wash of the brand purple behind the middle of the screen.
 *
 * The reference design calls for a radial bloom, which React Native has no
 * primitive for and which would cost a native dependency to fake properly. A
 * vertical gradient at a tenth of an alpha does the same job — it lifts the
 * equation off a flat black rectangle and gives the screen a centre — without
 * a blur pass, a glow, or anything the GPU has to think about on a device that
 * woke up two frames ago.
 */
function AmbientWash() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['transparent', 'rgba(123, 44, 191, 0.16)', 'transparent']}
      locations={[0, 0.5, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * The "this alarm is still going" indicator.
 *
 * Small and slow on purpose. It is the one thing on the screen allowed to move
 * continuously, and it earns that by being the only signal that the noise the
 * user is hearing is this app's rather than something else's.
 */
function RingingDot({ reducedMotion }: { reducedMotion: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return <Animated.View style={[styles.ringingDot, { opacity: pulse }]} />;
}

/**
 * How long the alarm has been ringing.
 *
 * Its own component so the second-by-second tick re-renders four digits rather
 * than the equation and the whole keypad underneath it.
 */
function RingTimer({ firedAt }: { firedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - firedAt) / 1000));
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <Text style={[Type.labelMd, styles.timer]} accessibilityLabel={`Ringing for ${text}`}>
      {text}
    </Text>
  );
}

/**
 * Progress through the required problems, as one thing rather than two.
 *
 * The screen used to carry a row of bars at the top and a separate "PROBLEM 2
 * OF 5" caption down in the middle, which is the same fact told twice in two
 * places at two sizes. They are now a single rail: the segments say how far
 * along you are at a glance, the caption says it exactly, and they sit on one
 * line so the eye reads them together.
 *
 * Three states rather than two, which is the point of rebuilding it — a solved
 * segment is filled, the one being worked on is outlined so it is visibly
 * *where you are*, and the rest are inert. Plain views rather than an SVG ring:
 * `react-native-svg` is a native dependency, and this is all the information it
 * would have carried.
 */
function ProgressRail({ total, done, label }: { total: number; done: number; label: string }) {
  return (
    <View style={styles.rail}>
      <View
        style={styles.segments}
        accessibilityRole="progressbar"
        accessibilityLabel={`${done} of ${total} problems solved`}
        accessibilityValue={{ min: 0, max: total, now: done }}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              index < done && styles.segmentDone,
              index === done && styles.segmentCurrent,
            ]}
          />
        ))}
      </View>
      <Text style={[Type.labelSm, styles.railLabel]}>{label}</Text>
    </View>
  );
}

/**
 * Cross-fades its child whenever the problem behind it changes.
 *
 * Keyed on the problem's id, not its text: the generator can legitimately draw
 * the same equation twice in a row, and a user who has just answered wrong
 * needs to see that something replaced it either way.
 *
 * The old problem is never shown fading out — it is simply gone, and the new
 * one arrives. Half a second of two overlapping equations is exactly the sort
 * of thing that is unreadable at 6am.
 */
function EquationSwap({
  problemId,
  reducedMotion,
  children,
}: {
  problemId: string;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: SWAP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [problemId, progress, reducedMotion]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

/**
 * The answer, presented as the tail of the equation above it.
 *
 * It used to be a fixed grey box showing an em dash until something was typed,
 * which gave no sign that it was the thing the keypad was filling. Now it has
 * a lead glyph tying it to the equation, a caret that shows where the next
 * digit lands, and a border that brightens the moment there is an answer in it,
 * so a glance confirms the keypad is reaching the right place.
 *
 * A wrong answer shakes it once. That is deliberately the only thing on the
 * screen that ever moves sideways — combined with the border turning red and
 * the line of text below changing, the failure is carried by three independent
 * signals, so it survives colour blindness, a muted phone and a face-down
 * screen alike.
 */
function AnswerField({
  entry,
  lead,
  wrongAt,
  finishing,
  reducedMotion,
}: {
  entry: string;
  lead: string;
  wrongAt: number | null;
  finishing: boolean;
  reducedMotion: boolean;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const wrong = wrongAt !== null;

  useEffect(() => {
    if (wrongAt === null) return;
    if (reducedMotion) {
      shake.setValue(0);
      return;
    }
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 0.6, -0.6, 0].map((toValue) =>
        Animated.timing(shake, {
          toValue,
          duration: 55,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [wrongAt, shake, reducedMotion]);

  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  return (
    <Animated.View
      style={[
        styles.answer,
        entry !== '' && styles.answerFilled,
        wrong && styles.answerWrong,
        { transform: [{ translateX }] },
      ]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={entry === '' ? 'No answer entered' : `Answer ${entry}`}>
      <Text style={styles.answerLead} importantForAccessibility="no">
        {lead}
      </Text>
      <Text style={styles.answerText} numberOfLines={1} importantForAccessibility="no">
        {entry}
      </Text>
      {finishing ? null : <Caret reducedMotion={reducedMotion} />}
    </Animated.View>
  );
}

/**
 * The insertion point.
 *
 * Blinks, because that is the one piece of motion every user on earth already
 * knows the meaning of. Held solid rather than stopped when reduced motion is
 * on, so the position is still shown.
 */
function Caret({ reducedMotion }: { reducedMotion: boolean }) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      blink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 60, delay: 470, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 60, delay: 470, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [blink, reducedMotion]);

  return <Animated.View style={[styles.caret, { opacity: blink }]} />;
}

/**
 * One line, and only when it has something to say.
 *
 * The old version rendered "0 wrong so far" from the moment the alarm went off,
 * which is a counter of nothing dressed up as feedback. The slot keeps its
 * height either way so the equation above it never jumps.
 */
function StatusLine({
  finishing,
  wrong,
  wrongCount,
}: {
  finishing: boolean;
  wrong: boolean;
  wrongCount: number;
}) {
  const text = finishing
    ? 'Correct — stopping the alarm'
    : wrong
      ? 'Wrong. Here is another one.'
      : wrongCount > 0
        ? `${wrongCount} wrong so far`
        : '';

  return (
    <View style={styles.status}>
      <Text
        style={[
          Type.bodySm,
          styles.statusText,
          wrong && styles.statusWrong,
          finishing && styles.statusDone,
        ]}
        accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.void,
    paddingHorizontal: Layout.screenPadding,
    gap: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  ringingDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    backgroundColor: Color.magenta,
  },
  headerLabel: {
    flex: 1,
    color: Color.textSecondary,
  },
  timer: {
    color: Color.magentaText,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: Space.xxs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.cardElevated,
  },
  segmentDone: {
    backgroundColor: Color.magenta,
  },
  segmentCurrent: {
    backgroundColor: Color.magentaFill,
    borderWidth: 1,
    borderColor: Color.magentaEdge,
  },
  railLabel: {
    color: Color.textMuted,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  equation: {
    textAlign: 'center',
  },
  answer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minWidth: 220,
    minHeight: 72,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
  },
  answerFilled: {
    borderColor: Color.cyanEdge,
  },
  answerWrong: {
    borderColor: Color.danger,
    backgroundColor: 'rgba(255, 90, 95, 0.1)',
  },
  answerLead: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 26,
    lineHeight: 34,
    color: Color.textMuted,
  },
  answerText: {
    fontFamily: FontFamily.monoBold,
    fontSize: 40,
    lineHeight: 48,
    color: Color.textPrimary,
  },
  caret: {
    width: 3,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Color.cyan,
  },
  // Fixed height so the equation does not shift as the line appears and goes.
  status: {
    height: 20,
    justifyContent: 'center',
  },
  statusText: {
    color: Color.textMuted,
    textAlign: 'center',
  },
  statusWrong: {
    color: Color.danger,
  },
  statusDone: {
    color: Color.cyan,
  },
});
