import { NativeModule, requireNativeModule } from 'expo';

import type {
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

  /** Ids currently pending in AlarmManager. Used to reconcile after a reboot. */
  getScheduledAlarmIds(): Promise<AlarmId[]>;

  // --- Wake screen / audio ------------------------------------------------

  /**
   * Stops audio and vibration and tears down the wake activity. Called by JS
   * once the required number of math problems has been answered correctly.
   */
  dismissAlarm(id: AlarmId): Promise<void>;

  // --- Permissions --------------------------------------------------------

  getPermissionStatus(): Promise<AlarmPermissionStatus>;

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
