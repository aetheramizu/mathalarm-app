import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  ActiveAlarm,
  AlarmCoreModuleEvents,
  AlarmId,
  AlarmPermissionStatus,
  ScheduleAlarmOptions,
} from './AlarmCore.types';

declare class AlarmCoreModule extends NativeModule<AlarmCoreModuleEvents> {
  // --- Scheduling ---------------------------------------------------------
  scheduleAlarm(options: ScheduleAlarmOptions): Promise<void>;
  cancelAlarm(id: AlarmId): Promise<void>;
  getScheduledAlarmIds(): Promise<AlarmId[]>;

  // --- Wake screen / audio ------------------------------------------------
  dismissAlarm(id: AlarmId): Promise<void>;
  getActiveAlarm(): Promise<ActiveAlarm | null>;

  // --- Permissions --------------------------------------------------------
  getPermissionStatus(): Promise<AlarmPermissionStatus>;
  requestNotificationsPermission(): Promise<boolean>;
  requestExactAlarmPermission(): Promise<void>;
  requestFullScreenIntentPermission(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

let nativeModule: AlarmCoreModule | null = null;
try {
  nativeModule = requireOptionalNativeModule<AlarmCoreModule>('AlarmCore');
} catch {
  nativeModule = null;
}

// Fallback implementation for Expo Go / preview environments where native code is not compiled in
const fallbackModule: Partial<AlarmCoreModule> = {
  async scheduleAlarm(options: ScheduleAlarmOptions): Promise<void> {
    console.warn('[AlarmCore Expo Go Mock] scheduleAlarm called:', options);
  },
  async cancelAlarm(id: AlarmId): Promise<void> {
    console.warn('[AlarmCore Expo Go Mock] cancelAlarm called:', id);
  },
  async getScheduledAlarmIds(): Promise<AlarmId[]> {
    return [];
  },
  async dismissAlarm(id: AlarmId): Promise<void> {
    console.warn('[AlarmCore Expo Go Mock] dismissAlarm called:', id);
  },
  async getActiveAlarm(): Promise<ActiveAlarm | null> {
    return null;
  },
  async getPermissionStatus(): Promise<AlarmPermissionStatus> {
    return {
      canScheduleExactAlarms: false,
      canPostNotifications: false,
      canUseFullScreenIntent: false,
      isIgnoringBatteryOptimizations: false,
    };
  },
  async requestNotificationsPermission(): Promise<boolean> {
    return false;
  },
  async requestExactAlarmPermission(): Promise<void> {},
  async requestFullScreenIntentPermission(): Promise<void> {},
  async requestIgnoreBatteryOptimizations(): Promise<void> {},
  addListener(): any {
    return { remove: () => {} };
  },
  removeListener(): void {},
};

export default (nativeModule ?? fallbackModule) as AlarmCoreModule;

