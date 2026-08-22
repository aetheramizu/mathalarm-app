package com.mathalarm.alarmcore

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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

class NotImplementedYetException(what: String) :
  CodedException("AlarmCore.$what is not implemented yet — pending the native spike")

class AlarmCoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw MissingContextException()

  private val alarmManager: AlarmManager
    get() = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  override fun definition() = ModuleDefinition {
    Name("AlarmCore")

    Events("onAlarmFired", "onAlarmDismissed")

    // --- Scheduling -------------------------------------------------------
    // TODO(spike): back these with AlarmManager.setAlarmClock + a BroadcastReceiver
    // that starts the wake activity. Risk 1 in the PRD.

    AsyncFunction("scheduleAlarm") { _: ScheduleAlarmOptions ->
      throw NotImplementedYetException("scheduleAlarm")
    }

    AsyncFunction("cancelAlarm") { _: String ->
      throw NotImplementedYetException("cancelAlarm")
    }

    AsyncFunction("getScheduledAlarmIds") {
      throw NotImplementedYetException("getScheduledAlarmIds")
    }

    // --- Wake screen / audio ----------------------------------------------
    // TODO(spike): risks 2 and 3 in the PRD — a full-screen-intent Activity with
    // setShowWhenLocked/setTurnScreenOn, plus STREAM_ALARM playback.

    AsyncFunction("dismissAlarm") { _: String ->
      throw NotImplementedYetException("dismissAlarm")
    }

    // --- Permissions ------------------------------------------------------
    // These are fully implemented: they are pure system queries with no
    // scheduling behaviour, so the spike can rely on them from day one.

    AsyncFunction("getPermissionStatus") {
      mapOf(
        "canScheduleExactAlarms" to canScheduleExactAlarms(),
        "canPostNotifications" to canPostNotifications(),
        "canUseFullScreenIntent" to canUseFullScreenIntent(),
        "isIgnoringBatteryOptimizations" to isIgnoringBatteryOptimizations()
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
