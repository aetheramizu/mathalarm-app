import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { runDataSelfCheck, type SelfCheckResult } from '@/data/self-check';
import { Color, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { Placeholder } from '@/ui/placeholder';
import { Screen } from '@/ui/screen';

export default function SettingsScreen() {
  if (!__DEV__) {
    return (
      <Screen>
        <Placeholder title="Settings" arrivesIn="ARRIVES IN P6" />
      </Screen>
    );
  }
  return <DevSettingsScreen />;
}

/**
 * Development scaffolding, not the Settings screen.
 *
 * The repositories are native-backed, so the only place they can be exercised
 * is a device. This runs the P1 round trip there and shows the result. It is
 * replaced wholesale by the real Settings screen in P6.
 */
function DevSettingsScreen() {
  const [result, setResult] = useState<SelfCheckResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      setResult(await runDataSelfCheck());
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={Type.labelSm}>MATHALARM · DEV</Text>
        <Text style={[Type.headlineLg, styles.title]}>Settings</Text>

        <Pressable
          onPress={run}
          disabled={running}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={[Type.titleLg, styles.buttonText]}>
            {running ? 'Running…' : 'Run data self-check'}
          </Text>
        </Pressable>

        {result ? (
          <View style={styles.results}>
            <Text style={[Type.labelMd, { color: result.ok ? Color.cyan : Color.danger }]}>
              {result.ok ? 'PASS' : 'FAIL'} · {result.steps.filter((s) => s.ok).length}/
              {result.steps.length}
            </Text>
            {result.steps.map((step) => (
              <View key={step.name} style={styles.row}>
                <Text style={[Type.labelSm, { color: step.ok ? Color.cyan : Color.danger }]}>
                  {step.ok ? 'OK ' : 'FAIL'}
                </Text>
                <Text style={[Type.bodySm, styles.rowText]}>
                  {step.name}
                  {step.detail ? ` — ${step.detail}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[Type.bodySm, styles.footnote]}>The real Settings screen arrives in P6.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xxl,
    paddingBottom: Space.xxxl,
    gap: Space.xs,
  },
  title: {
    marginBottom: Space.md,
  },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.cyanEdge,
  },
  buttonPressed: {
    backgroundColor: Color.cardElevated,
  },
  buttonText: {
    color: Color.cyan,
  },
  results: {
    marginTop: Space.md,
    padding: Space.md,
    gap: Space.xs,
    borderRadius: Radius.lg,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  row: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  rowText: {
    flex: 1,
  },
  footnote: {
    marginTop: Space.lg,
    color: Color.textMuted,
  },
});
