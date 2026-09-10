import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Color, Layout, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';
import { Keypad } from '@/ui/keypad';

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

/**
 * The challenge itself.
 *
 * Everything on this screen is sized for someone who has just been woken by it:
 * the equation is the largest thing on the display, the keys are 64dp rather
 * than the 48dp platform minimum, and there is no blur, no gradient and no
 * entrance animation — it has to be on screen and usable the instant the
 * device wakes, and every effect is a frame it might not have.
 *
 * There is no visible way out. No header, no tab bar, no cancel. Solving is the
 * only exit, which is the product.
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

  // A wrong answer is announced by a heavier haptic as well as by the text: at
  // 6am the phone may be face down on a bedside table when it is answered.
  useEffect(() => {
    if (wrongAt === null) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [wrongAt]);

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
      <Pressable
        // The only escape hatch, and it exists solely so a development build can
        // be tested without solving five hard problems. `onDevAbort` refuses in
        // any other build, and the hint is not rendered in one.
        onLongPress={onDevAbort}
        delayLongPress={2500}
        style={styles.header}>
        <Text style={[Type.labelSm, styles.headerLabel]} numberOfLines={1}>
          {(progress.alarmLabel ?? 'ALARM').toUpperCase()}
        </Text>
        <RingTimer firedAt={progress.firedAt} />
      </Pressable>

      <StepDots total={progress.requiredProblems} done={progress.stepIndex} />

      <View style={styles.stage}>
        <Text style={Type.labelSm}>
          PROBLEM {Math.min(progress.stepIndex + 1, progress.requiredProblems)} OF{' '}
          {progress.requiredProblems}
        </Text>

        <Text style={[Type.displayEquation, styles.equation]} adjustsFontSizeToFit numberOfLines={1}>
          {progress.problem.prompt}
        </Text>

        <View style={[styles.entry, wrongAt !== null && styles.entryWrong]}>
          <Text
            style={[styles.entryText, entry === '' && styles.entryPlaceholder]}
            numberOfLines={1}
            accessibilityLabel={entry === '' ? 'No answer entered' : `Answer ${entry}`}>
            {entry === '' ? '—' : entry}
          </Text>
        </View>

        <Text style={[Type.bodySm, styles.status, wrongAt !== null && styles.statusWrong]}>
          {finishing
            ? 'Correct. Stopping the alarm…'
            : wrongAt !== null
              ? 'Wrong — here is a new problem'
              : `${progress.wrongCount} wrong so far`}
        </Text>
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
 * Progress through the required problems.
 *
 * Dots and bars from plain views rather than an SVG ring: `react-native-svg` is
 * a native dependency, and this is the information it would have carried.
 */
function StepDots({ total, done }: { total: number; done: number }) {
  return (
    <View
      style={styles.dots}
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} problems solved`}
      accessibilityValue={{ min: 0, max: total, now: done }}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.dot, index < done && styles.dotDone]} />
      ))}
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
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  headerLabel: {
    flex: 1,
    color: Color.textSecondary,
  },
  timer: {
    color: Color.magentaText,
  },
  dots: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.cardElevated,
  },
  dotDone: {
    backgroundColor: Color.magenta,
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
  entry: {
    minWidth: 200,
    minHeight: 72,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
  },
  entryWrong: {
    borderColor: Color.danger,
    backgroundColor: 'rgba(255, 90, 95, 0.1)',
  },
  entryText: {
    fontFamily: FontFamily.monoBold,
    fontSize: 40,
    lineHeight: 48,
    color: Color.textPrimary,
  },
  entryPlaceholder: {
    color: Color.textMuted,
  },
  status: {
    color: Color.textMuted,
  },
  statusWrong: {
    color: Color.danger,
  },
});
