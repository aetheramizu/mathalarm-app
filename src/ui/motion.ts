import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the device has been asked to keep animation to a minimum.
 *
 * Android exposes this as the "Remove animations" accessibility setting, and it
 * is turned on by people who find motion distracting or genuinely
 * nausea-inducing. Every animation in the app is decorative in the strict
 * sense — the information is in the text and the colour either way — so each
 * one reads this and simply lands on its end state instead.
 *
 * Read once on mount and then kept current: the setting can be changed from the
 * notification shade without the app restarting.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduced(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
