package com.mathalarm.alarmcore

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** Intent keys shared by the receiver, the service and the module. */
internal object AlarmIntents {
  const val EXTRA_ALARM_ID = "com.mathalarm.alarmcore.extra.ALARM_ID"
  const val EXTRA_ALARM_LABEL = "com.mathalarm.alarmcore.extra.ALARM_LABEL"
  const val EXTRA_FIRED_AT = "com.mathalarm.alarmcore.extra.FIRED_AT"
  const val EXTRA_REASON = "com.mathalarm.alarmcore.extra.REASON"
}

/**
 * The scheduling half of the kernel.
 *
 * Everything goes through `setAlarmClock`. `setExactAndAllowWhileIdle` is the
 * usual suggestion, but Android throttles it to roughly one firing every nine
 * minutes in Doze, which is unacceptable for the one feature this app exists
 * to provide. `setAlarmClock` is exempt from Doze entirely and, as a bonus,
 * populates the system's "next alarm" affordance — a user-visible signal that
 * the alarm really is armed.
 */
internal object AlarmScheduler {

  fun schedule(context: Context, alarm: PendingAlarm) {
    AlarmStore.putPending(context, alarm)

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val info = AlarmManager.AlarmClockInfo(alarm.triggerAtMs, showIntent(context))
    alarmManager.setAlarmClock(info, firePendingIntent(context, alarm))
  }

  fun cancel(context: Context, id: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val existing = AlarmStore.getPending(context, id)
      ?: PendingAlarm(id = id, triggerAtMs = 0L, label = null)
    alarmManager.cancel(firePendingIntent(context, existing))
    AlarmStore.removePending(context, id)
  }

  /**
   * Re-arms everything after a reboot or an app update, both of which clear
   * AlarmManager's table.
   *
   * Alarms whose time passed while the device was off are dropped rather than
   * fired late: waking someone with a 3am alarm at 9am is worse than not
   * waking them at all. JS reconciles its own database against
   * `getScheduledAlarmIds` on next launch and re-arms any repeat occurrences.
   */
  fun rescheduleAll(context: Context) {
    val now = System.currentTimeMillis()
    AlarmStore.allPending(context).forEach { alarm ->
      if (alarm.triggerAtMs > now) {
        schedule(context, alarm)
      } else {
        AlarmStore.removePending(context, alarm.id)
      }
    }
  }

  /**
   * The PendingIntent AlarmManager delivers when the alarm goes off.
   *
   * The request code must be derived from the id alone and nothing else, or a
   * later `cancel` would build a non-matching PendingIntent and silently fail
   * to cancel anything. Extras are excluded from PendingIntent equality, which
   * is why the label may be carried inside without affecting matching.
   */
  private fun firePendingIntent(context: Context, alarm: PendingAlarm): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      // A distinct action per alarm keeps two different ids from colliding
      // even if their hash codes happen to match.
      action = "com.mathalarm.alarmcore.action.FIRE:${alarm.id}"
      putExtra(AlarmIntents.EXTRA_ALARM_ID, alarm.id)
      putExtra(AlarmIntents.EXTRA_ALARM_LABEL, alarm.label)
    }
    return PendingIntent.getBroadcast(
      context,
      alarm.id.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /**
   * What the system opens when the user taps the status-bar alarm affordance.
   * Purely informational — it just brings the app up.
   */
  private fun showIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
