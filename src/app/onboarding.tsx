import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as settingsRepo from '@/data/repositories/settings';
import { Color, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { PermissionRow } from '@/features/settings/PermissionRow';
import { usePermissions } from '@/features/settings/usePermissions';
import { alarmsAreBlocked, type PermissionKey } from '@/services/permissions';
import { PrimaryButton, SecondaryButton } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';

const PERMISSION_ORDER: PermissionKey[] = [
  'exactAlarms',
  'notifications',
  'fullScreenIntent',
  'batteryOptimisation',
];

/**
 * The first-run permission gate.
 *
 * It explains rather than demands, and it can always be left. A gate that
 * refuses to let the user into the app until every permission is granted turns
 * a reliability problem into a hostage situation — and they would have to leave
 * anyway, since three of the four are granted on a system screen. What it does
 * instead is be honest: the button says what state they are leaving in.
 */
export default function OnboardingScreen() {
  const { status, request } = usePermissions();
  // There is no tab bar under this screen to absorb the gesture area, so the
  // footer has to clear it itself.
  const insets = useSafeAreaInsets();
  const blocked = alarmsAreBlocked(status);

  const finish = () => {
    void settingsRepo.setOnboardingCompleted(true);
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={Type.labelSm}>MATHALARM · SETUP</Text>
          <Text style={Type.headlineLg}>Before your first alarm</Text>
          <Text style={Type.bodyMd}>
            An alarm has to survive a locked, sleeping phone. Android gates that behind four separate
            permissions, and each one does something different. Nothing here leaves your device.
          </Text>
        </View>

        <Card style={styles.card}>
          {PERMISSION_ORDER.map((key, index) => (
            <PermissionRow
              key={key}
              permission={key}
              granted={status[key]}
              onRequest={() => void request(key)}
              last={index === PERMISSION_ORDER.length - 1}
            />
          ))}
        </Card>

        {blocked ? (
          <Text style={[Type.bodySm, styles.warning]}>
            You can carry on without these. Alarms may not ring until they are granted, and Settings
            will keep showing what is missing.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Space.md) }]}>
        {blocked ? (
          <SecondaryButton label="Continue anyway" onPress={finish} />
        ) : (
          <PrimaryButton label="Start using MathAlarm" icon="check" onPress={finish} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.lg,
    gap: Space.lg,
  },
  header: {
    gap: Space.xs,
  },
  card: {
    paddingVertical: 0,
  },
  warning: {
    color: Color.danger,
  },
  footer: {
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Color.border,
  },
});
