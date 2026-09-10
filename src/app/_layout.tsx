import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as settingsRepo from '@/data/repositories/settings';
import { fontAssets } from '@/design/fonts';
import { Color } from '@/design/tokens';
import { reconcile } from '@/services/alarm-scheduler';
import { ringingAlarmId, subscribeToAlarmFired } from '@/services/wake-session';

SplashScreen.preventAutoHideAsync();

/**
 * MathAlarm is dark-only, so the navigation theme is patched rather than
 * switched: the stock DarkTheme background is a lighter grey than the void the
 * design is built on, and it shows as a flash between screens.
 */
const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Color.void,
    card: Color.void,
    text: Color.textPrimary,
    border: Color.border,
    primary: Color.magenta,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // A missing font file must not leave the user staring at a splash screen
  // forever, so a load failure proceeds with the system font instead.
  const fontsReady = fontsLoaded || !!fontError;

  useReconciliation();
  const wakeChecked = useRingingAlarmRouting(fontsReady);

  useEffect(() => {
    // The splash stays up until it is settled whether an alarm is ringing, so
    // a cold start into a ringing alarm never flashes the alarm list first.
    if (fontsReady && wakeChecked) void SplashScreen.hideAsync();
  }, [fontsReady, wakeChecked]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={AppTheme}>
        <StatusBar style="light" />
        {/*
          No headers anywhere. Screens draw their own titles, and the wake
          screen has to cover the entire window when an alarm fires — a
          navigation bar peeking above it would be a visible seam and, worse, a
          way to leave the challenge without solving anything.
        */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Color.void } }}>
          <Stack.Screen name="(tabs)" />
          {/*
            `wake` is a sibling of the tab group, not a route inside it. That is
            structural: a route inside the group would render the tab bar over
            the ringing alarm, which is an escape hatch out of the challenge.
          */}
          <Stack.Screen name="wake" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Keeps the kernel and the database in step for as long as the app is alive.
 *
 * Once on cold start, and again on every return to the foreground — the app can
 * be backgrounded for days, cross a DST boundary, or come back from a system
 * settings screen where the user just granted or revoked the exact-alarm
 * permission, and in each case what is armed may no longer match what the
 * database says should be.
 *
 * Reconciliation opens the database itself, so it deliberately does not wait on
 * fonts: an alarm being armed correctly must not depend on a typeface loading.
 */
function useReconciliation() {
  useEffect(() => {
    const run = () => {
      void reconcile().catch((error) => {
        console.warn('[MathAlarm] reconciliation failed', error);
      });
    };

    run();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, []);
}

/**
 * Decides where a cold start lands: the wake screen if an alarm is ringing, the
 * permission gate on first run, and the alarm list otherwise. Also sends the
 * user to the wake screen when an alarm fires with the app already open.
 *
 * The cold path is the one that matters: an alarm normally goes off with no JS
 * context alive, so `onAlarmFired` was broadcast to nobody. What is ringing is
 * discovered by asking, not by listening. The event listener exists only for
 * the far rarer case of an alarm firing while the app is already on screen.
 *
 * Gated on the fonts having loaded because that is when this layout first
 * renders a navigator — there is nothing to navigate before then.
 */
function useRingingAlarmRouting(ready: boolean): boolean {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void ringingAlarmId()
      .then(async (id) => {
        if (cancelled) return;
        // A ringing alarm outranks first-run setup: the user is being woken up,
        // not onboarded.
        if (id) {
          router.replace('/wake');
          return;
        }
        if (!(await settingsRepo.isOnboardingCompleted())) router.replace('/onboarding');
      })
      .catch((error) => {
        console.warn('[MathAlarm] could not check for a ringing alarm', error);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const subscription = subscribeToAlarmFired(() => router.replace('/wake'));
    return () => subscription.remove();
  }, [ready]);

  // Asked again on every foreground, not only at launch. It covers an alarm
  // that fired while the app was backgrounded with no listener attached, and
  // the rare case of a dismissal whose native call did not land — either way,
  // an alarm that is audibly ringing must have its challenge on screen.
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void ringingAlarmId()
        .then((id) => {
          if (id) router.replace('/wake');
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [ready]);

  return checked;
}
