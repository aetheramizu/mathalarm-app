import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fontAssets } from '@/design/fonts';
import { Color } from '@/design/tokens';
import { reconcile } from '@/services/alarm-scheduler';

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

  useReconciliation();

  useEffect(() => {
    // A missing font file must not leave the user staring at a splash screen
    // forever, so a load failure proceeds with the system font instead.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
