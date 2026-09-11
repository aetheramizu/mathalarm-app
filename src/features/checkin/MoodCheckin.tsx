import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as sessionsRepo from '@/data/repositories/sessions';
import { Color, Layout, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { MOODS, type Mood } from '@/domain/mood/types';
import { PrimaryButton } from '@/ui/button';

type Props = {
  sessionId: string;
  onDone: () => void;
};

export function MoodCheckin({ sessionId, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [onDone]);

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await sessionsRepo.setMood(sessionId, selected);
    } catch (e) {
      console.warn('[checkin] failed to save mood', e);
    } finally {
      onDone();
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + Space.xl,
          paddingBottom: Math.max(insets.bottom, Space.md) + Space.md,
        },
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={[Type.labelSm, styles.badgeText]}>MORNING CHECK-IN</Text>
        </View>
        <Text style={[Type.headlineMd, styles.title]}>What's your mood right now?</Text>
        <Text style={[Type.bodyMd, styles.subtitle]}>
          Log how you're feeling to unlock wake-up patterns over time.
        </Text>
      </View>

      {/* Mood Options Grid */}
      <View style={styles.grid}>
        {MOODS.map((m) => {
          const isSelected = selected === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setSelected(m.key)}
              accessibilityRole="radio"
              accessibilityLabel={`${m.label} mood`}
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.card,
                isSelected && {
                  borderColor: m.color,
                  backgroundColor: Color.cardElevated,
                },
              ]}>
              <View
                style={[
                  styles.emojiCircle,
                  isSelected && { backgroundColor: `${m.color}20` },
                ]}>
                <Text style={styles.emoji}>{m.emoji}</Text>
              </View>
              <Text
                style={[
                  Type.titleLg,
                  styles.cardLabel,
                  isSelected && { color: Color.textPrimary },
                ]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <PrimaryButton
          label={saving ? 'Saving…' : 'Save check-in'}
          onPress={handleSave}
          disabled={!selected || saving}
        />
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Skip check-in"
          hitSlop={8}
          style={styles.skipButton}>
          <Text style={[Type.bodyMd, styles.skipText]}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.void,
    paddingHorizontal: Layout.screenPadding,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.md,
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Color.cardElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.borderStrong,
    marginBottom: Space.xs,
  },
  badgeText: {
    color: Color.magentaText,
  },
  title: {
    color: Color.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    color: Color.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    justifyContent: 'center',
    marginVertical: Space.xl,
  },
  card: {
    width: '46%',
    backgroundColor: Color.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Color.border,
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    gap: Space.sm,
  },
  emojiCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    backgroundColor: Color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 32,
  },
  cardLabel: {
    color: Color.textSecondary,
  },
  actions: {
    gap: Space.sm,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Space.sm,
  },
  skipText: {
    color: Color.textMuted,
  },
});
