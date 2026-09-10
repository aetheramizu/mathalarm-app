import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as settingsRepo from '@/data/repositories/settings';
import { REQUIRED_PROBLEMS } from '@/domain/math/engine';
import type { Difficulty } from '@/domain/math/types';
import { Color, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { PermissionRow } from '@/features/settings/PermissionRow';
import { usePermissions } from '@/features/settings/usePermissions';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { alarmsAreBlocked, type PermissionKey } from '@/services/permissions';

const PERMISSION_ORDER: PermissionKey[] = [
  'exactAlarms',
  'notifications',
  'fullScreenIntent',
  'batteryOptimisation',
];

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Permission health, the default difficulty, and nothing else.
 *
 * The permission panel is the same rows as the first-run gate, kept
 * permanently: a permission granted in June can be revoked by an OEM battery
 * sweep in July, and the only way the user finds out before an alarm fails is
 * if this screen keeps telling the truth.
 */
export default function SettingsScreen() {
  const { status, request } = usePermissions();
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>('medium');

  useFocusEffect(
    useCallback(() => {
      void settingsRepo.getDefaultDifficulty().then(setDefaultDifficulty);
    }, [])
  );

  const chooseDifficulty = (difficulty: Difficulty) => {
    setDefaultDifficulty(difficulty);
    void settingsRepo.setDefaultDifficulty(difficulty);
  };

  const blocked = alarmsAreBlocked(status);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={Type.labelSm}>MATHALARM</Text>
          <Text style={Type.headlineLg}>Settings</Text>
        </View>

        <Section
          title="Permissions"
          caption={
            blocked
              ? 'Something required is missing — alarms may not ring.'
              : 'Alarms have what they need from Android.'
          }
          captionTone={blocked ? 'danger' : 'ok'}
          flush>
          {PERMISSION_ORDER.map((key, index) => (
            <PermissionRow
              key={key}
              permission={key}
              granted={status[key]}
              onRequest={() => void request(key)}
              last={index === PERMISSION_ORDER.length - 1}
            />
          ))}
        </Section>

        <Section
          title="Default difficulty"
          caption="Applies to new alarms only. Alarms you have already made keep the difficulty you gave them."
          flush>
          <View style={styles.tiers} accessibilityRole="radiogroup">
            {DIFFICULTIES.map((tier) => {
              const on = tier === defaultDifficulty;
              return (
                <Pressable
                  key={tier}
                  onPress={() => chooseDifficulty(tier)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${tier}, ${REQUIRED_PROBLEMS[tier]} problems`}
                  accessibilityState={{ selected: on }}
                  android_ripple={{ color: Color.borderStrong }}
                  style={({ pressed }) => [styles.tier, on && styles.tierOn, pressed && styles.tierPressed]}>
                  <Text style={[Type.labelMd, on ? styles.tierOnText : styles.tierText]}>
                    {tier.toUpperCase()}
                  </Text>
                  <Text style={Type.bodySm}>{REQUIRED_PROBLEMS[tier]} to solve</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="About">
          <Text style={Type.bodyMd}>
            MathAlarm {Constants.expoConfig?.version ?? '1.0.0'} · Android only. Everything stays on
            this device: no account, no sync, no analytics leaving the phone.
          </Text>
          <Text style={[Type.bodySm, styles.aboutNote]}>
            There is no snooze. Solving the maths is the only way to stop an alarm.
          </Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  caption,
  captionTone,
  flush,
  children,
}: {
  title: string;
  caption?: string;
  captionTone?: 'ok' | 'danger';
  /** The panel's rows bring their own vertical padding, so the card drops its own. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[Type.headlineSm, styles.sectionTitle]}>{title}</Text>
      {caption ? (
        <Text
          style={[
            Type.bodySm,
            captionTone === 'danger' && styles.captionDanger,
            captionTone === 'ok' && styles.captionOk,
          ]}>
          {caption}
        </Text>
      ) : null}
      <Card style={[styles.card, flush && styles.cardFlush]}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl * 2,
    gap: Space.xl,
  },
  header: {
    gap: Space.xxs,
  },
  section: {
    gap: Space.xs,
  },
  sectionTitle: {
    marginTop: Space.xs,
  },
  captionDanger: {
    color: Color.danger,
  },
  captionOk: {
    color: Color.cyan,
  },
  card: {
    marginTop: Space.xxs,
    gap: Space.xs,
  },
  cardFlush: {
    paddingVertical: 0,
  },
  tiers: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  tier: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    backgroundColor: Color.cardElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  tierOn: {
    backgroundColor: Color.magentaFill,
    borderColor: Color.magentaEdge,
  },
  tierPressed: {
    backgroundColor: Color.borderStrong,
  },
  tierText: {
    color: Color.textSecondary,
  },
  tierOnText: {
    color: Color.magentaText,
  },
  aboutNote: {
    color: Color.textMuted,
  },
});
