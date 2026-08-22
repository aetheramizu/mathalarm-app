/**
 * Public types for the AlarmCore native module.
 *
 * AlarmCore owns only the native-side concerns: exact scheduling, the
 * full-screen wake activity, and alarm-stream audio. Everything else —
 * the math engine, difficulty, repeat-day expansion, persistence — lives
 * in TypeScript. Native is told *when* to fire and *which* alarm id;
 * it never knows what a math problem is.
 */

/** Identifies one scheduled occurrence. Stable across reschedules of a repeating alarm. */
export type AlarmId = string;

export type ScheduleAlarmOptions = {
  /** Caller-owned id. Rescheduling with an existing id replaces that alarm. */
  id: AlarmId;
  /** Absolute wall-clock fire time, ms since epoch. */
  triggerAtMs: number;
  /** Shown on the wake screen and in the AlarmClock status-bar affordance. */
  label?: string;
};

/**
 * Why the wake screen closed. Only `solved` is reachable by the user in v1 —
 * the others exist so JS can tell a genuine dismissal from a system teardown.
 */
export type DismissReason = 'solved' | 'cancelled' | 'systemStopped';

export type AlarmCoreModuleEvents = {
  /** Fired when an alarm goes off and the wake activity is coming up. */
  onAlarmFired: (params: AlarmFiredPayload) => void;
  /** Fired once the wake activity has torn down and audio has stopped. */
  onAlarmDismissed: (params: AlarmDismissedPayload) => void;
};

export type AlarmFiredPayload = {
  id: AlarmId;
  label?: string;
  /** Actual fire time, which may lag `triggerAtMs` if the device was dozing. */
  firedAtMs: number;
};

export type AlarmDismissedPayload = {
  id: AlarmId;
  reason: DismissReason;
};

/**
 * The alarm that is ringing right now. Native keeps this in device-protected
 * storage, so it is still readable when the app was launched cold by the
 * alarm's full-screen intent — the case where no JS event listener existed at
 * the moment the alarm actually went off.
 */
export type ActiveAlarm = {
  id: AlarmId;
  label?: string;
  firedAtMs: number;
};

/**
 * Android gates each of these behind a different permission with a different
 * API level and a different settings screen, so they are reported separately
 * rather than as one boolean.
 */
export type AlarmPermissionStatus = {
  /** SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM. Always true below API 31. */
  canScheduleExactAlarms: boolean;
  /** POST_NOTIFICATIONS. Always true below API 33. */
  canPostNotifications: boolean;
  /** USE_FULL_SCREEN_INTENT. Always true below API 34. */
  canUseFullScreenIntent: boolean;
  /**
   * Whether the app is exempt from Doze battery optimization. Not strictly
   * required — setAlarmClock survives Doze — but aggressive OEM skins
   * (MIUI, EMUI, One UI) are materially more reliable when it is granted.
   */
  isIgnoringBatteryOptimizations: boolean;
};
