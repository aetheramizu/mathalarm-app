import AlarmCore from '../../modules/alarm-core';

/**
 * The four capabilities an alarm needs from Android, and how to ask for each.
 *
 * They are handled one at a time rather than as a single "permissions granted"
 * boolean because Android gates each behind a different API level, a different
 * settings screen, and a different failure mode. Two of them break ringing
 * outright; two degrade it. Collapsing them would lose exactly the information
 * the user needs to fix the problem.
 */

export type PermissionKey =
  | 'exactAlarms'
  | 'notifications'
  | 'fullScreenIntent'
  | 'batteryOptimisation';

export type PermissionStatus = Record<PermissionKey, boolean>;

/** Assumed denied until proven otherwise — never claim a capability the app may not have. */
export const UNKNOWN_STATUS: PermissionStatus = {
  exactAlarms: false,
  notifications: false,
  fullScreenIntent: false,
  batteryOptimisation: false,
};

export async function getStatus(): Promise<PermissionStatus> {
  const native = await AlarmCore.getPermissionStatus();
  return {
    exactAlarms: native.canScheduleExactAlarms,
    notifications: native.canPostNotifications,
    fullScreenIntent: native.canUseFullScreenIntent,
    batteryOptimisation: native.isIgnoringBatteryOptimizations,
  };
}

/**
 * Asks for one capability.
 *
 * Only notifications resolves in-process. The other three hand off to a system
 * settings screen and resolve as soon as it opens, so their real answer only
 * arrives on the next foreground — which is why the caller re-reads status on
 * every `AppState → active` rather than trusting what this returns.
 */
export async function request(key: PermissionKey): Promise<void> {
  switch (key) {
    case 'notifications':
      await AlarmCore.requestNotificationsPermission();
      return;
    case 'exactAlarms':
      await AlarmCore.requestExactAlarmPermission();
      return;
    case 'fullScreenIntent':
      await AlarmCore.requestFullScreenIntentPermission();
      return;
    case 'batteryOptimisation':
      await AlarmCore.requestIgnoreBatteryOptimizations();
      return;
  }
}

/**
 * Whether a missing permission will stop an alarm ringing at all.
 *
 * Without exact alarms the alarm is not scheduled to the minute; without
 * notifications the foreground service cannot post, and Android will not let it
 * run. Those two are fatal. The full-screen intent decides whether the
 * challenge appears over the lock screen, and the battery exemption only makes
 * aggressive OEM skins better behaved — real, but not fatal.
 */
export const BLOCKS_RINGING: PermissionKey[] = ['exactAlarms', 'notifications'];

export function alarmsAreBlocked(status: PermissionStatus): boolean {
  return BLOCKS_RINGING.some((key) => !status[key]);
}
