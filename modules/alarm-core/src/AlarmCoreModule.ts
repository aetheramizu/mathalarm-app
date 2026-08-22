import { NativeModule, requireNativeModule } from 'expo';

import type {
  ActiveAlarm,
  AlarmCoreModuleEvents,
  AlarmId,
  AlarmPermissionStatus,
  ScheduleAlarmOptions,
} from './AlarmCore.types';

declare class AlarmCoreModule extends NativeModule<AlarmCoreModuleEvents> {
  // --- Scheduling ---------------------------------------------------------

  /**
   * Schedules an exact alarm via `AlarmManager.setAlarmClock`, which is the
   * only Android scheduling API that survives Doze without an exemption and
   * that surfaces the system's next-alarm affordance.
   *
   * Rejects if `canScheduleExactAlarms` is false — call `getPermissionStatus`
   * first rather than relying on the rejection.
   */
  scheduleAlarm(options: ScheduleAlarmOptions): Promise<void>;

  /** Cancels a pending alarm. Cancelling an unknown id is a no-op, not an error. */
  cancelAlarm(id: AlarmId): Promise<void>;

  /**
   * Ids the native side believes are armed, used to reconcile after a reboot.
   *
   * This is native's own record, not a query of AlarmManager — Android exposes
   * no way to enumerate pending alarms. The two can therefore drift if the
   * system drops an alarm without telling us, so treat this as the best
   * available answer rather than ground truth.
   */
  getScheduledAlarmIds(): Promise<AlarmId[]>;

  // --- Wake screen / audio ------------------------------------------------

  /**
   * Stops audio and vibration and tears down the wake activity. Called by JS
   * once the required number of math problems has been answered correctly.
   */
  dismissAlarm(id: AlarmId): Promise<void>;

  /**
   * The currently ringing alarm, or null. This is the pull-based counterpart
   * to `onAlarmFired`: when the alarm launches the app cold, the JS context
   * does not exist yet at fire time, so the wake screen reads this on mount
   * rather than waiting for an event that has already been missed.
   */
  getActiveAlarm(): Promise<ActiveAlarm | null>;

  // --- Permissions --------------------------------------------------------

  getPermissionStatus(): Promise<AlarmPermissionStatus>;

  /**
   * The only one of these with a real in-app dialog, and the most important:
   * on Android 13+ a suppressed notification also suppresses the full-screen
   * intent attached to it, so without this the alarm rings with no wake screen.
   * Resolves with the user's actual answer.
   */
  requestNotificationsPermission(): Promise<boolean>;

  /**
   * Each of these opens the relevant system settings screen; Android offers no
   * in-app grant dialog for them. Resolves when the intent is launched, NOT
   * when the user decides — re-read `getPermissionStatus` on app resume.
   */
  requestExactAlarmPermission(): Promise<void>;
  requestFullScreenIntentPermission(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

export default requireNativeModule<AlarmCoreModule>('AlarmCore');
