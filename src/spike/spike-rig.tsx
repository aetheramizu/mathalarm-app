import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mono, Rig } from './rig-theme';
import { WakeScreen } from './wake-screen';
import { clockOf, useAlarmCore } from './use-alarm-core';
import type { AlarmPermissionStatus } from '../../modules/alarm-core';

const READINESS: { key: keyof AlarmPermissionStatus; label: string; note: string }[] = [
  { key: 'canScheduleExactAlarms', label: 'EXACT ALARM', note: 'API 31+ · required to fire at all' },
  { key: 'canPostNotifications', label: 'NOTIFICATIONS', note: 'API 33+ · gates the wake screen' },
  { key: 'canUseFullScreenIntent', label: 'FULL SCREEN', note: 'API 34+ · shows over lock screen' },
  { key: 'isIgnoringBatteryOptimizations', label: 'BATTERY EXEMPT', note: 'optional · OEM reliability' },
];

const OFFSETS = [10, 30, 60, 300];

/**
 * The field-test rig for AlarmCore.
 *
 * Its only job is to make the three PRD risks falsifiable on a real handset:
 * arm an alarm, lock the phone, and watch whether it fires, whether the wake
 * screen surfaces over the keyguard, and whether it is audible on silent. The
 * log is the instrument — every native event lands there with a timestamp, so a
 * failed run says *where* it failed rather than just that it did.
 */
export function SpikeRig() {
  const { permissions, activeAlarm, scheduledIds, log, refresh, arm, cancel, dismiss, request } =
    useAlarmCore();

  const blocking = READINESS.filter(
    (row) => row.key !== 'isIgnoringBatteryOptimizations' && permissions?.[row.key] === false
  ).length;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.masthead}>
            <View style={styles.mastheadRow}>
              <Text style={styles.wordmark}>ALARM CORE</Text>
              <Pressable onPress={() => void refresh()} hitSlop={12}>
                <Text style={styles.refresh}>REFRESH</Text>
              </Pressable>
            </View>
            <Text style={styles.tagline}>FIELD TEST RIG · v0.1 · ANDROID</Text>
            <View style={styles.rule} />
            <Text
              style={[
                styles.verdict,
                { color: permissions == null ? Rig.dim : blocking === 0 ? Rig.ok : Rig.alert },
              ]}>
              {permissions == null
                ? 'READING DEVICE…'
                : blocking === 0
                  ? 'READY TO FIRE'
                  : `${blocking} PERMISSION${blocking > 1 ? 'S' : ''} BLOCKING`}
            </Text>
          </View>

          <Section title="READINESS" caption="tap a row to open its grant flow">
            {READINESS.map((row) => {
              const granted = permissions?.[row.key];
              return (
                <Pressable
                  key={row.key}
                  onPress={() => void request(row.key)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowNote}>{row.note}</Text>
                  </View>
                  <Text
                    style={[
                      styles.pill,
                      granted === true && styles.pillOk,
                      granted === false && styles.pillAlert,
                    ]}>
                    {granted === undefined ? '····' : granted ? 'GRANTED' : 'BLOCKED'}
                  </Text>
                </Pressable>
              );
            })}
          </Section>

          <Section title="ARM" caption="then lock the phone and put it on silent">
            <View style={styles.armGrid}>
              {OFFSETS.map((seconds) => (
                <Pressable
                  key={seconds}
                  onPress={() => void arm(seconds)}
                  style={({ pressed }) => [styles.armKey, pressed && styles.armKeyPressed]}>
                  <Text style={styles.armKeyValue}>
                    {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                  </Text>
                  <Text style={styles.armKeyLabel}>T-MINUS</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title="PENDING" caption={`${scheduledIds.length} held by AlarmManager`}>
            {scheduledIds.length === 0 ? (
              <Text style={styles.empty}>nothing armed</Text>
            ) : (
              scheduledIds.map((id) => (
                <View key={id} style={styles.row}>
                  <Text style={styles.mono} numberOfLines={1}>
                    {id}
                  </Text>
                  <Pressable onPress={() => void cancel(id)} hitSlop={10}>
                    <Text style={styles.cancel}>CANCEL</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="LOG" caption="newest first">
            {log.length === 0 ? (
              <Text style={styles.empty}>no events yet</Text>
            ) : (
              log.map((entry) => (
                <View key={entry.key} style={styles.logRow}>
                  <Text style={styles.logTime}>{clockOf(entry.at)}</Text>
                  <Text
                    style={[
                      styles.logText,
                      entry.level === 'ok' && { color: Rig.ok },
                      entry.level === 'alert' && { color: Rig.alert },
                    ]}>
                    {entry.text}
                  </Text>
                </View>
              ))
            )}
          </Section>

          <Text style={styles.footnote}>
            A pass looks like this: the screen lights on its own, this rig&apos;s wake screen is on
            top of the lock screen, and it is audible with the phone silenced. Anything less is a
            failed run — read the log to see how far it got.
          </Text>
        </ScrollView>
      </SafeAreaView>

      {activeAlarm ? (
        <WakeScreen
          alarm={activeAlarm}
          onSolved={(id) => void dismiss(id)}
          onAbort={(id) => void dismiss(id)}
        />
      ) : null}
    </View>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCaption}>{caption}</Text>
      </View>
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Rig.chassis },
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 28, paddingBottom: 48 },

  masthead: { gap: 6 },
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: Rig.text,
    fontFamily: Mono,
    fontSize: 20,
    letterSpacing: 6,
  },
  refresh: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 10,
    letterSpacing: 2,
  },
  tagline: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 10,
    letterSpacing: 2,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Rig.line,
    marginVertical: 10,
  },
  verdict: {
    fontFamily: Mono,
    fontSize: 13,
    letterSpacing: 3,
  },

  section: { gap: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: Rig.amber,
    fontFamily: Mono,
    fontSize: 11,
    letterSpacing: 4,
  },
  sectionCaption: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 10,
    flexShrink: 1,
    textAlign: 'right',
  },
  panel: {
    backgroundColor: Rig.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Rig.line,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Rig.line,
  },
  rowPressed: { backgroundColor: Rig.panelRaised },
  rowText: { flexShrink: 1, gap: 3 },
  rowLabel: {
    color: Rig.text,
    fontFamily: Mono,
    fontSize: 13,
    letterSpacing: 1,
  },
  rowNote: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 10,
  },
  pill: {
    fontFamily: Mono,
    fontSize: 10,
    letterSpacing: 1,
    color: Rig.dim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Rig.line,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  pillOk: { color: Rig.ok, borderColor: '#1F3D2A' },
  pillAlert: { color: Rig.alert, borderColor: '#4A1D18' },

  armGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  armKey: {
    width: '50%',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Rig.line,
  },
  armKeyPressed: { backgroundColor: Rig.panelRaised },
  armKeyValue: {
    color: Rig.amber,
    fontFamily: Mono,
    fontSize: 26,
    letterSpacing: 1,
  },
  armKeyLabel: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 9,
    letterSpacing: 2,
  },

  mono: {
    color: Rig.text,
    fontFamily: Mono,
    fontSize: 12,
    flexShrink: 1,
  },
  cancel: {
    color: Rig.alert,
    fontFamily: Mono,
    fontSize: 10,
    letterSpacing: 2,
  },
  empty: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 11,
    padding: 14,
  },

  logRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  logTime: {
    color: '#3F464C',
    fontFamily: Mono,
    fontSize: 11,
  },
  logText: {
    color: Rig.text,
    fontFamily: Mono,
    fontSize: 11,
    flexShrink: 1,
  },

  footnote: {
    color: Rig.dim,
    fontFamily: Mono,
    fontSize: 10,
    lineHeight: 17,
  },
});
