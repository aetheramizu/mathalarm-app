package com.mathalarm.alarmcore

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * AlarmManager's table does not survive a reboot, and an app update clears the
 * app's alarms too. Both events land here and re-arm from the native store.
 *
 * The manifest registers several actions rather than only BOOT_COMPLETED
 * because some OEM skins substitute their own vendor broadcast for it.
 *
 * LOCKED_BOOT_COMPLETED is deliberately not among them. It arrives before first
 * unlock, but nothing downstream can run that early — the wake screen is React
 * Native — so re-arming then would only buy alarms that fire into a crash.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON" -> {
        // A reboot cannot leave an alarm ringing, so clear any stale active
        // record before re-arming — otherwise the app would open straight into
        // a wake screen for an alarm that is no longer sounding.
        AlarmStore.clearActive(context)
        AlarmScheduler.rescheduleAll(context)
      }
    }
  }
}
