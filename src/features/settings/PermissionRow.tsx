import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Color, Layout, Radius, Space } from '@/design/tokens';
import { Type } from '@/design/typography';
import type { PermissionKey } from '@/services/permissions';

/**
 * What each permission is, in the user's terms rather than Android's.
 *
 * `SCHEDULE_EXACT_ALARM` means nothing to anybody; "the alarm can go off at the
 * exact minute you set" does. Each line says what breaks without it, because a
 * permission prompt with no stated consequence is just a demand.
 */
export const PERMISSION_INFO: Record<
  PermissionKey,
  { title: string; why: string; required: boolean; icon: keyof typeof MaterialIcons.glyphMap }
> = {
  exactAlarms: {
    title: 'Exact alarms',
    why: 'Lets the alarm go off at the exact minute you set. Without it, Android may delay it by minutes or hours.',
    required: true,
    icon: 'schedule',
  },
  notifications: {
    title: 'Notifications',
    why: 'Android requires a notification for the service that plays the alarm. Without it the alarm cannot ring at all.',
    required: true,
    icon: 'notifications-active',
  },
  fullScreenIntent: {
    title: 'Full-screen alerts',
    why: 'Lets the challenge take over the screen over your lock screen. Without it you get only a notification.',
    required: false,
    icon: 'fullscreen',
  },
  batteryOptimisation: {
    title: 'Unrestricted battery',
    why: 'Stops aggressive battery saving from killing the alarm while you sleep. Strongly recommended on Samsung, Xiaomi and similar.',
    required: false,
    icon: 'battery-alert',
  },
};

type Props = {
  permission: PermissionKey;
  granted: boolean;
  onRequest: () => void;
  /** The last row in a panel drops its divider, which would otherwise sit on the card edge. */
  last?: boolean;
};

/**
 * One permission, its state, and the way to fix it.
 *
 * The state is carried by an icon, a word and a colour together — never colour
 * alone. A granted row keeps its explanation rather than collapsing, so the
 * panel reads the same on the day something gets revoked.
 */
export function PermissionRow({ permission, granted, onRequest, last }: Props) {
  const info = PERMISSION_INFO[permission];
  const tone = granted ? 'granted' : info.required ? 'missing' : 'advisory';

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.head}>
        <MaterialIcons
          name={info.icon}
          size={20}
          color={granted ? Color.cyan : info.required ? Color.danger : Color.textSecondary}
        />
        <Text style={[Type.titleLg, styles.title]} numberOfLines={1}>
          {info.title}
        </Text>
        <Text style={[Type.labelSm, TONE_TEXT[tone]]}>{TONE_LABEL[tone]}</Text>
      </View>

      <Text style={Type.bodySm}>{info.why}</Text>

      {granted ? null : (
        <Pressable
          onPress={onRequest}
          accessibilityRole="button"
          accessibilityLabel={`Grant ${info.title}`}
          accessibilityHint="Opens the Android setting for this permission"
          android_ripple={{ color: Color.borderStrong }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
          <Text style={[Type.labelMd, styles.actionText]}>GRANT</Text>
          <MaterialIcons name="chevron-right" size={18} color={Color.magentaText} />
        </Pressable>
      )}
    </View>
  );
}

const TONE_LABEL = {
  granted: 'GRANTED',
  missing: 'REQUIRED',
  advisory: 'RECOMMENDED',
} as const;

const TONE_TEXT = {
  granted: { color: Color.cyan },
  missing: { color: Color.danger },
  advisory: { color: Color.textSecondary },
} as const;

const styles = StyleSheet.create({
  row: {
    gap: Space.xs,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Color.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  title: {
    flex: 1,
  },
  action: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    minHeight: Layout.minTouch,
    paddingHorizontal: Space.md,
    marginTop: Space.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Color.magentaFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.magentaEdge,
    overflow: 'hidden',
  },
  actionPressed: {
    backgroundColor: Color.cardElevated,
  },
  actionText: {
    color: Color.magentaText,
  },
});
