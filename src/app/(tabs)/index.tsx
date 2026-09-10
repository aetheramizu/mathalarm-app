import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { Alarm } from '@/data/models';
import * as settingsRepo from '@/data/repositories/settings';
import type { Difficulty } from '@/domain/math/types';
import { Color, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import { AlarmCard, NextAlarmSummary } from '@/features/alarms/AlarmCard';
import { AlarmForm } from '@/features/alarms/AlarmForm';
import { useAlarms } from '@/features/alarms/useAlarms';
import { PrimaryButton } from '@/ui/button';
import { Screen } from '@/ui/screen';

/**
 * The home screen: every alarm, and the one way to make another.
 *
 * Reading order is the priority order — what is about to ring, then the action
 * to add one, then the full list. The reference design opens with a greeting, a
 * sync badge and a notification bell above all of that; none of them tell the
 * user when they are getting up.
 */
export default function AlarmsScreen() {
  const { alarms, loading, now, create, update, setEnabled, remove } = useAlarms();
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>('medium');

  // Re-read on focus rather than once on mount: the user may have just changed
  // it in Settings, and the next new alarm should inherit the new value.
  useFocusEffect(
    useCallback(() => {
      void settingsRepo.getDefaultDifficulty().then(setDefaultDifficulty);
    }, [])
  );

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (alarm: Alarm) => {
    setEditing(alarm);
    setFormOpen(true);
  };

  const next = alarms.find((alarm) => alarm.enabled && alarm.nextTriggerAt !== null) ?? null;

  return (
    <Screen>
      <FlatList
        data={alarms}
        keyExtractor={(alarm) => alarm.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={Type.labelSm}>MATHALARM</Text>
            <Text style={Type.headlineLg}>Alarms</Text>

            {next ? <NextAlarmSummary alarm={next} now={now} /> : null}

            <PrimaryButton
              label="New alarm"
              icon="add"
              onPress={openNew}
              accessibilityHint="Opens the alarm editor"
            />

            {alarms.length > 0 ? (
              <Text style={[Type.labelSm, styles.sectionLabel]}>
                ALL ALARMS · {alarms.length}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={loading ? null : <EmptyState />}
        renderItem={({ item }) => (
          <AlarmCard
            alarm={item}
            now={now}
            onPress={() => openEdit(item)}
            onToggle={(enabled) => void setEnabled(item.id, enabled)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <AlarmForm
        visible={formOpen}
        alarm={editing}
        defaultDifficulty={defaultDifficulty}
        onClose={() => setFormOpen(false)}
        onSave={async (input) => {
          if (editing) await update(editing.id, input);
          else await create(input);
        }}
        onDelete={async () => {
          if (editing) await remove(editing.id);
        }}
      />
    </Screen>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <MaterialIcons name="alarm-off" size={40} color={Color.textMuted} />
      <Text style={[Type.headlineSm, styles.emptyTitle]}>No alarms yet</Text>
      <Text style={[Type.bodyMd, styles.emptyBody]}>
        Set one above. When it rings you will have to solve maths to switch it off — there is no
        snooze.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    // Clears the tab bar, which floats over the list.
    paddingBottom: Space.xxxl * 2,
  },
  header: {
    gap: Space.md,
    marginBottom: Space.md,
  },
  sectionLabel: {
    marginTop: Space.xs,
  },
  separator: {
    height: Space.xs,
  },
  empty: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xxxl,
  },
  emptyTitle: {
    marginTop: Space.xs,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
