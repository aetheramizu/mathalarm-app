import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';

import * as wakeSession from '@/services/wake-session';

import { blocksBack, initialState, isCorrect, reduce, type WakeState } from './machine';

/**
 * Wires the wake reducer to the database, the native kernel and the app
 * lifecycle.
 *
 * Every rule about *ordering* lives here or in `services/wake-session`, and
 * every rule about *state* lives in the reducer. The split is what keeps the
 * decision "may this alarm stop" testable without a device.
 */
export function useWakeMachine(): {
  state: WakeState;
  submit: () => void;
  digit: (digit: number) => void;
  backspace: () => void;
  abortForDevelopment: () => void;
} {
  const [state, dispatch] = useReducer(reduce, initialState);
  // Bumped to re-run resolution when a different alarm takes over the device.
  const [resolveNonce, setResolveNonce] = useState(0);

  // The reducer's state, readable from callbacks and listeners that were
  // created before it changed.
  const current = useRef(state);
  current.current = state;

  // Answers are a sequence of awaited writes; a second submit landing in the
  // middle of one would record an answer against a problem already replaced.
  const busy = useRef(false);
  const dismissing = useRef(false);

  // --- Resolving ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    void wakeSession
      .resolveWake()
      .then((progress) => {
        if (cancelled) return;
        if (progress) dispatch({ type: 'resumed', progress });
        else dispatch({ type: 'no_alarm' });
      })
      .catch((error) => {
        console.warn('[wake] could not resolve the ringing alarm', error);
        if (!cancelled) dispatch({ type: 'no_alarm' });
      });

    return () => {
      cancelled = true;
    };
  }, [resolveNonce]);

  // --- A second alarm -------------------------------------------------------

  /**
   * Two alarms a minute apart, the first still unsolved: native moves on to the
   * second, so the screen has to as well. The first session is closed as
   * `system_stopped`, which is exactly what happened to it, and resolution runs
   * again against whatever is ringing now.
   */
  useEffect(() => {
    const subscription = wakeSession.subscribeToAlarmFired(({ id }) => {
      const state = current.current;
      if (state.phase !== 'solving' && state.phase !== 'dismissing') return;
      if (state.progress.alarmId === id) return;

      const { sessionId } = state.progress;
      dispatch({ type: 'restart' });
      void wakeSession
        .closeFromNative(sessionId, 'systemStopped')
        .catch(() => {})
        .finally(() => setResolveNonce((nonce) => nonce + 1));
    });

    return () => subscription.remove();
  }, []);

  // --- Native teardown ------------------------------------------------------

  useEffect(() => {
    const subscription = wakeSession.subscribeToAlarmDismissed(({ id, reason }) => {
      const state = current.current;
      if (state.phase !== 'solving') return;
      if (state.progress.alarmId !== id) return;
      if (reason === 'solved') return; // our own dismissal, already handled

      void wakeSession
        .closeFromNative(state.progress.sessionId, reason)
        .then((outcome) => dispatch({ type: 'closed', outcome }))
        .catch(() => dispatch({ type: 'closed', outcome: 'system_stopped' }));
    });

    return () => subscription.remove();
  }, []);

  // Whether the alarm is still ringing is asked of native on every foreground,
  // never inferred from a JS timer that a doze can freeze.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState !== 'active') return;
      const state = current.current;
      if (state.phase !== 'solving') return;

      void wakeSession.ringingAlarmId().then((ringingId) => {
        const now = current.current;
        if (now.phase !== 'solving') return;
        if (ringingId === now.progress.alarmId) return;

        void wakeSession
          .closeFromNative(now.progress.sessionId, 'systemStopped')
          .then((outcome) => dispatch({ type: 'closed', outcome }))
          .catch(() => dispatch({ type: 'closed', outcome: 'system_stopped' }));
      });
    });

    return () => subscription.remove();
  }, []);

  // --- Back button ----------------------------------------------------------

  useEffect(() => {
    // Swallowing back is the whole point of the screen: an alarm that can be
    // backed out of is an alarm with a snooze button.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      blocksBack(current.current)
    );
    return () => subscription.remove();
  }, []);

  // --- Dismissal ------------------------------------------------------------

  useEffect(() => {
    if (state.phase !== 'dismissing') {
      // Reset on the way out, so a challenge that returns here — a second alarm
      // arriving mid-dismissal sends the screen back through `resolving` — is
      // not silently skipped by the guard below.
      dismissing.current = false;
      return;
    }
    if (dismissing.current) return;
    dismissing.current = true;

    void wakeSession
      .dismissSolved(state.progress)
      .catch((error) => {
        // The session is already marked solved, so the history is right either
        // way; reconciliation on the next foreground re-arms whatever is left.
        console.warn('[wake] dismissal did not complete cleanly', error);
      })
      .finally(() => dispatch({ type: 'closed', outcome: 'solved' }));
  }, [state]);

  // --- Input ----------------------------------------------------------------

  const digit = useCallback((value: number) => {
    if (busy.current) return;
    dispatch({ type: 'digit', digit: value });
  }, []);

  const backspace = useCallback(() => {
    if (busy.current) return;
    dispatch({ type: 'backspace' });
  }, []);

  const submit = useCallback(() => {
    const state = current.current;
    if (state.phase !== 'solving' || busy.current) return;
    if (state.entry === '') return;

    const { progress, entry } = state;
    const correct = isCorrect(entry, progress.problem);
    const at = Date.now();
    busy.current = true;

    void (async () => {
      try {
        await wakeSession.recordAnswer(progress, { given: Number(entry), correct, answeredAt: at });

        if (!correct) {
          const problem = wakeSession.nextProblemAfterWrong(progress);
          await wakeSession.saveProgress({
            ...progress,
            wrongCount: progress.wrongCount + 1,
            problem,
            firstAnswerAt: progress.firstAnswerAt ?? at,
          });
          dispatch({ type: 'wrong', problem, at });
          return;
        }

        const solved = progress.stepIndex + 1 >= progress.requiredProblems;
        if (solved) {
          // No challenge row is written here: the dismissal deletes it, and the
          // session write that follows is what makes the wake-up recoverable.
          dispatch({ type: 'complete', at });
          return;
        }

        const problem = wakeSession.nextProblem(progress);
        await wakeSession.saveProgress({
          ...progress,
          stepIndex: progress.stepIndex + 1,
          problem,
          firstAnswerAt: progress.firstAnswerAt ?? at,
        });
        dispatch({ type: 'advance', problem, at });
      } catch (error) {
        // A failed write must not strand the user on a dead keypad; the entry
        // is cleared and the same problem stands.
        console.warn('[wake] could not record the answer', error);
        dispatch({ type: 'clear' });
      } finally {
        busy.current = false;
      }
    })();
  }, []);

  const abortForDevelopment = useCallback(() => {
    const state = current.current;
    if (!__DEV__ || state.phase !== 'solving') return;
    void wakeSession
      .abortForDevelopment(state.progress)
      .then((aborted) => {
        if (aborted) dispatch({ type: 'closed', outcome: 'cancelled' });
      })
      .catch(() => {});
  }, []);

  return { state, submit, digit, backspace, abortForDevelopment };
}
