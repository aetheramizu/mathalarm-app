import { NavigationBar } from 'expo-navigation-bar';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Color } from '@/design/tokens';
import { WakeChallenge } from '@/features/wake/WakeChallenge';
import { useWakeMachine } from '@/features/wake/useWakeMachine';

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

  useEffect(() => {
    if (state.phase !== 'closed') return;
    // `replace`, not `back`: the screen may be the first and only entry in the
    // stack when the alarm launched the app cold, and there would be nothing
    // behind it to go back to.
    router.replace('/(tabs)');
  }, [state.phase]);

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
      <NavigationBar hidden />
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
