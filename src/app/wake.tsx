import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import * as sessionsRepo from '@/data/repositories/sessions';
import { Color } from '@/design/tokens';
import { isMorningAlarm } from '@/domain/mood/eligibility';
import { startOfLocalDay } from '@/domain/schedule/relative';
import { MoodCheckin } from '@/features/checkin/MoodCheckin';
import { WakeChallenge } from '@/features/wake/WakeChallenge';
import { useWakeMachine } from '@/features/wake/useWakeMachine';

let NavigationBar: React.ComponentType<{ hidden?: boolean }> | null = null;
try {
  // Graceful fallback if the native module is missing from the dev client
  NavigationBar = require('expo-navigation-bar').NavigationBar;
} catch (e) {
  console.warn("expo-navigation-bar native module is missing. Navigation bar will not be hidden.");
}

/**
 * The full-screen challenge, and the reason this route is a sibling of the tab
 * group rather than a screen inside it: while an alarm is ringing there must be
 * no tab bar, no header, and no gesture that leaves without solving.
 *
 * The route is thin by design — resolving what is ringing, recording answers
 * and dismissing all live in `features/wake` and `services/wake-session`.
 */
export default function WakeScreen() {
  const { state, submit, digit, backspace, abortForDevelopment } = useWakeMachine();
  const [showCheckin, setShowCheckin] = useState(false);
  const checkinSessionIdRef = useRef<string | null>(null);
  const lastSessionRef = useRef<{ sessionId: string; alarmHour: number } | null>(null);

  if (state.phase === 'solving' || state.phase === 'dismissing') {
    lastSessionRef.current = {
      sessionId: state.progress.sessionId,
      alarmHour: state.progress.alarmHour,
    };
  }

  useEffect(() => {
    if (state.phase !== 'closed') return;

    if (state.outcome !== 'solved') {
      router.replace('/(tabs)');
      return;
    }

    const sessionInfo = lastSessionRef.current;
    if (!sessionInfo) {
      router.replace('/(tabs)');
      return;
    }

    let cancelled = false;

    async function evaluateEligibility(info: { sessionId: string; alarmHour: number }) {
      try {
        if (!isMorningAlarm(info.alarmHour)) {
          if (!cancelled) router.replace('/(tabs)');
          return;
        }

        const now = Date.now();
        const todayStartMs = startOfLocalDay(now);
        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStartMs = startOfLocalDay(tomorrowDate.getTime());

        const alreadyConsumed = await sessionsRepo.hasSolvedMorningSession(
          info.sessionId,
          todayStartMs,
          tomorrowStartMs
        );

        if (cancelled) return;

        if (alreadyConsumed) {
          router.replace('/(tabs)');
        } else {
          checkinSessionIdRef.current = info.sessionId;
          setShowCheckin(true);
        }
      } catch (err) {
        console.warn('[wake] error checking checkin eligibility', err);
        if (!cancelled) router.replace('/(tabs)');
      }
    }

    void evaluateEligibility(sessionInfo);

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.phase === 'closed' ? state.outcome : null]);

  if (showCheckin && checkinSessionIdRef.current) {
    return (
      <>
        <StatusBar style="light" />
        <MoodCheckin
          sessionId={checkinSessionIdRef.current}
          onDone={() => {
            setShowCheckin(false);
            lastSessionRef.current = null;
            router.replace('/(tabs)');
          }}
        />
      </>
    );
  }

  if (state.phase === 'resolving' || state.phase === 'closed') {
    return (
      <View style={styles.loading}>
        <Immersive />
        <ActivityIndicator color={Color.magenta} />
      </View>
    );
  }

  const finishing = state.phase === 'dismissing';

  return (
    <>
      <Immersive />
      <WakeChallenge
        progress={state.progress}
        entry={finishing ? '' : state.entry}
        wrongAt={finishing ? null : state.wrongAt}
        finishing={finishing}
        onDigit={digit}
        onBackspace={backspace}
        onSubmit={submit}
        onDevAbort={abortForDevelopment}
      />
    </>
  );
}

/**
 * Immersive mode, for this route only.
 *
 * Every other screen leaves Android's system bars alone and pads around them —
 * hiding them app-wide would be fighting the platform. The alarm is the one
 * place where taking the whole window is right: the challenge is the only thing
 * on the device that matters at that moment, the status bar's clock and
 * notification icons are a distraction from it, and the navigation bar is a row
 * of exits sitting under a screen whose entire purpose is having no exit.
 *
 * Both components are declarative and stack-based: each pushes an entry while
 * it is mounted and pops it on the way out, so leaving the challenge restores
 * whatever the rest of the app had set without this route having to remember
 * it. Android still reveals the bars transiently on a swipe from the edge, and
 * that is fine — back is refused by `useWakeMachine` either way, so a visible
 * bar is not a way out.
 */
function Immersive() {
  return (
    <>
      <StatusBar hidden />
      {NavigationBar && <NavigationBar hidden />}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Color.void,
  },
});
