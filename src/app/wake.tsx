import { Placeholder } from '@/ui/placeholder';
import { Screen } from '@/ui/screen';

/**
 * The full-screen challenge, and the reason this route is a sibling of the tab
 * group rather than a screen inside it: while an alarm is ringing there must be
 * no tab bar, no header, and no gesture that leaves without solving.
 *
 * P0 ships the route and its position in the navigator. The state machine, the
 * keypad and the session recording arrive in P5.
 */
export default function WakeScreen() {
  return (
    <Screen>
      <Placeholder title="Challenge" arrivesIn="ARRIVES IN P5" />
    </Screen>
  );
}
