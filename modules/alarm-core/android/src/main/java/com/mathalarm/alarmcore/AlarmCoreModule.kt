package com.mathalarm.alarmcore

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ScheduleAlarmOptions : Record {
  @Field val id: String = ""
  @Field val triggerAtMs: Double = 0.0
  @Field val label: String? = null
}

class MissingContextException :
  CodedException("AlarmCore could not resolve an Android context")

class MissingPermissionsManagerException :
  CodedException("AlarmCore could not reach the Expo permissions manager")

class ExactAlarmPermissionException :
  CodedException(
    "AlarmCore cannot schedule exact alarms — SCHEDULE_EXACT_ALARM has not been granted. " +
      "Call getPermissionStatus() and requestExactAlarmPermission() first."
  )

/**
 * The JS-facing surface of the alarm kernel.
 *
 * The division of labour is deliberate and narrow: this module knows *when* to
 * fire and *which* id, and nothing else. Difficulty, problem generation,
 * repeat-day expansion and the alarm database all live in TypeScript, so the
 * part that is hardest to change — native code shipped inside a build — is
 * also the part with the fewest reasons to change.
 */
class AlarmCoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw MissingContextException()

  private val alarmManager: AlarmManager
    get() = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  /**
   * Guards against emitting `onAlarmFired` twice for one ring: once from the
   * live broadcast and again from the replay that runs when the app is brought
   * to the foreground by the full-screen intent.
   */
  private var emittedFiredId: String? = null

  private val alarmEventReceiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context, intent: Intent) {
      val id = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_ID) ?: return
      when (intent.action) {
        AlarmService.EVENT_FIRED -> {
          emittedFiredId = id
          sendEvent(
            "onAlarmFired",
            mapOf(
              "id" to id,
              "label" to intent.getStringExtra(AlarmIntents.EXTRA_ALARM_LABEL),
              "firedAtMs" to intent.getLongExtra(AlarmIntents.EXTRA_FIRED_AT, 0L).toDouble()
            )
          )
        }

        AlarmService.EVENT_DISMISSED -> {
          if (emittedFiredId == id) emittedFiredId = null
          sendEvent(
            "onAlarmDismissed",
            mapOf(
              "id" to id,
              "reason" to (intent.getStringExtra(AlarmIntents.EXTRA_REASON)
                ?: AlarmService.REASON_SOLVED)
            )
          )
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AlarmCore")

    Events("onAlarmFired", "onAlarmDismissed")

    OnCreate {
      registerAlarmEventReceiver()
    }

    OnDestroy {
      runCatching { context.unregisterReceiver(alarmEventReceiver) }
    }

    // An alarm almost always fires while JS is dead, so the event arrives via
    // one of these two paths instead of the live broadcast: the full-screen
    // intent brings the app up (new intent), or the user opens it themselves
    // (foreground). Both replay from the store.
    OnActivityEntersForeground { replayActiveAlarm() }
    OnNewIntent { replayActiveAlarm() }

    // --- Scheduling -------------------------------------------------------

    AsyncFunction("scheduleAlarm") { options: ScheduleAlarmOptions ->
      if (!canScheduleExactAlarms()) throw ExactAlarmPermissionException()
      AlarmScheduler.schedule(
        context,
        PendingAlarm(
          id = options.id,
          triggerAtMs = options.triggerAtMs.toLong(),
          label = options.label
        )
      )
    }

    AsyncFunction("cancelAlarm") { id: String ->
      AlarmScheduler.cancel(context, id)
    }

    AsyncFunction("getScheduledAlarmIds") {
      AlarmStore.allPending(context).map { it.id }
    }

    // --- Wake screen / audio ----------------------------------------------

    AsyncFunction("dismissAlarm") { id: String ->
      // Starting a service from the background throws on API 26+, and this is
      // only ever called from the wake screen, which is by definition in the
      // foreground. Failing softly keeps a stray call from crashing the app.
      runCatching { AlarmService.dismiss(context, id, AlarmService.REASON_SOLVED) }
      Unit
    }

    /**
     * The pull-based counterpart to `onAlarmFired`. The wake screen calls this
     * on mount because a freshly launched JS context has no listener attached
     * at the moment the alarm actually goes off.
     */
    AsyncFunction("getActiveAlarm") {
      AlarmStore.getActive(context)?.let {
        mapOf(
          "id" to it.id,
          "label" to it.label,
          "firedAtMs" to it.firedAtMs.toDouble()
        )
      }
    }

    // --- Permissions ------------------------------------------------------

    AsyncFunction("getPermissionStatus") {
      mapOf(
        "canScheduleExactAlarms" to canScheduleExactAlarms(),
        "canPostNotifications" to canPostNotifications(),
        "canUseFullScreenIntent" to canUseFullScreenIntent(),
        "isIgnoringBatteryOptimizations" to isIgnoringBatteryOptimizations()
      )
    }

    /**
     * The one permission here that has a real in-app dialog. It matters more
     * than it looks: without POST_NOTIFICATIONS on Android 13+, the foreground
     * notification is suppressed, and suppressing it also suppresses the
     * full-screen intent riding on it — the alarm would ring with no wake
     * screen at all.
     */
    AsyncFunction("requestNotificationsPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(true)
        return@AsyncFunction
      }

      val permissions = appContext.permissions
        ?: throw MissingPermissionsManagerException()

      permissions.askForPermissions(
        { result ->
          val granted =
            result[Manifest.permission.POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED
          promise.resolve(granted)
        },
        Manifest.permission.POST_NOTIFICATIONS
      )
    }

    AsyncFunction("requestExactAlarmPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, withPackage = true)
      }
    }

    AsyncFunction("requestFullScreenIntentPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        openSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, withPackage = true)
      }
    }

    AsyncFunction("requestIgnoreBatteryOptimizations") {
      // Deliberately opens the settings list rather than
      // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, whose direct-prompt form is a
      // Play Store policy violation for most app categories.
      openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS, withPackage = false)
    }
  }

  // --- Event plumbing -----------------------------------------------------

  private fun registerAlarmEventReceiver() {
    val filter = IntentFilter().apply {
      addAction(AlarmService.EVENT_FIRED)
      addAction(AlarmService.EVENT_DISMISSED)
    }
    // These broadcasts are sent with setPackage(), so they never leave the app;
    // API 33 still requires the export intent to be stated explicitly.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(alarmEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(alarmEventReceiver, filter)
    }
  }

  private fun replayActiveAlarm() {
    val active = AlarmStore.getActive(context) ?: return
    if (emittedFiredId == active.id) return
    emittedFiredId = active.id
    sendEvent(
      "onAlarmFired",
      mapOf(
        "id" to active.id,
        "label" to active.label,
        "firedAtMs" to active.firedAtMs.toDouble()
      )
    )
  }

  // --- Permission queries -------------------------------------------------

  private fun canScheduleExactAlarms(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      alarmManager.canScheduleExactAlarms()
    } else {
      true
    }

  private fun canPostNotifications(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }

  private fun canUseFullScreenIntent(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.canUseFullScreenIntent()
    } else {
      true
    }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  // --- Helpers ------------------------------------------------------------

  /**
   * Settings screens are launched from the application context rather than the
   * current activity, so the flow still works when the wake activity is the
   * thing on screen. NEW_TASK is mandatory in that case.
   */
  private fun openSettings(action: String, withPackage: Boolean) {
    val intent = Intent(action).apply {
      if (withPackage) data = Uri.fromParts("package", context.packageName, null)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }
}
