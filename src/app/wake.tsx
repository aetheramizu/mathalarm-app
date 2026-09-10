import { router } from 'expo-router';
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
        <ActivityIndicator color={Color.magenta} />
      </View>
    );
  }

  const finishing = state.phase === 'dismissing';

  return (
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
