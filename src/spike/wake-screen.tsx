import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Mono, Rig } from './rig-theme';
import { clockOf } from './use-alarm-core';
import type { ActiveAlarm } from '../../modules/alarm-core';

type Problem = { prompt: string; answer: number };

/** Spike-grade generator. The real difficulty ladder lives in the math engine. */
function nextProblem(): Problem {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  return { prompt: `${left} + ${right}`, answer: left + right };
}

type Props = {
  alarm: ActiveAlarm;
  onSolved: (id: string) => void;
  onAbort: (id: string) => void;
};

/**
 * The wake screen the full-screen intent brings up.
 *
 * It carries one addition problem rather than the real difficulty ladder,
 * because what it is testing is not the maths — it is whether this view can
 * appear over a locked screen at all, and whether solving it actually silences
 * native audio. Those are PRD risks 2 and 3.
 */
export function WakeScreen({ alarm, onSolved, onAbort }: Props) {
  const [problem, setProblem] = useState<Problem>(nextProblem);
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // A ticking counter is the cheapest proof that the alarm really did fire when
  // it was supposed to, and how long the ring has been going.
  useEffect(() => {
    const started = alarm.firedAtMs;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [alarm.firedAtMs]);

  const submit = useCallback(() => {
    if (entry.length === 0) return;
    if (Number(entry) === problem.answer) {
      onSolved(alarm.id);
      return;
    }
    // A wrong answer earns a brand-new problem, per the PRD — guess-spamming a
    // fixed question is not a way out.
    setWrong(true);
    setEntry('');
    setProblem(nextProblem());
  }, [alarm.id, entry, onSolved, problem.answer]);

  const keys = useMemo(() => ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK'], []);

  const press = useCallback(
    (key: string) => {
      if (key === 'CLR') {
        setEntry('');
        return;
      }
      if (key === 'OK') {
        submit();
        return;
      }
      setWrong(false);
      setEntry((current) => (current.length >= 4 ? current : current + key));
    },
    [submit]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.ringing}>ALARM RINGING</Text>
        <Text style={styles.meta}>
          {clockOf(alarm.firedAtMs)} · {elapsed}s
        </Text>
      </View>

      <View style={styles.stage}>
        <Text style={styles.label} numberOfLines={1}>
          {alarm.label ?? alarm.id}
        </Text>
        <Text style={styles.prompt}>{problem.prompt}</Text>
        <View style={[styles.entryBox, wrong && styles.entryBoxWrong]}>
          <Text style={styles.entry}>{entry.length > 0 ? entry : '_'}</Text>
        </View>
        <Text style={[styles.hint, wrong && styles.hintWrong]}>
          {wrong ? 'WRONG — NEW PROBLEM' : 'SOLVE TO SILENCE'}
        </Text>
      </View>

      <View style={styles.pad}>
        {keys.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            style={({ pressed }) => [
              styles.key,
              key === 'OK' && styles.keyPrimary,
              pressed && styles.keyPressed,
            ]}>
            <Text style={[styles.keyText, key === 'OK' && styles.keyTextPrimary]}>{key}</Text>
          </Pressable>
        ))}
      </View>

      {/*
        Escape hatch for testing only. Deliberately a two-second hold with no
        press feedback, so it cannot be hit half-asleep — but it exists, because
        being trapped by a ringing prototype at 3am is a real hazard.
      */}
      <Pressable delayLongPress={2000} onLongPress={() => onAbort(alarm.id)} style={styles.abort}>
        <Text style={styles.abortText}>HOLD 2s — RIG ABORT</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#120404',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Rig.alert,
    paddingBottom: 10,
  },
  ringing: {
    color: Rig.alert,
    fontFamily: Mono,
    fontSize: 13,
    letterSpacing: 3,
  },
  meta: {
    color: '#8A4B44',
    fontFamily: Mono,
    fontSize: 12,
  },
  stage: {
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: '#8A4B44',
    fontFamily: Mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  prompt: {
    color: Rig.text,
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: 2,
  },
  entryBox: {
    minWidth: 160,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: Rig.alert,
    paddingBottom: 6,
  },
  entryBoxWrong: { borderBottomColor: '#5A1B14' },
  entry: {
    color: Rig.amber,
    fontFamily: Mono,
    fontSize: 44,
    letterSpacing: 4,
  },
  hint: {
    color: '#8A4B44',
    fontFamily: Mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  hintWrong: { color: Rig.alert },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  key: {
    // Three per row, computed from the 8px gaps rather than a fixed width so
    // the pad fills any handset.
    width: '31.5%',
    flexGrow: 1,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#1E0908',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A1512',
  },
  keyPressed: { backgroundColor: '#2E0D0B' },
  keyPrimary: { backgroundColor: Rig.alert, borderColor: Rig.alert },
  keyText: {
    color: Rig.text,
    fontFamily: Mono,
    fontSize: 22,
  },
  keyTextPrimary: { color: '#120404', fontWeight: '700' },
  abort: {
    alignSelf: 'center',
    paddingVertical: 10,
  },
  abortText: {
    color: '#5A2A25',
    fontFamily: Mono,
    fontSize: 10,
    letterSpacing: 2,
  },
});
