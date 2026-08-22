package com.mathalarm.alarmcore

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * The entry point when an alarm actually goes off.
 *
 * This runs on the main thread with roughly ten seconds before the system
 * kills the process, so it does exactly one thing: hand off to a foreground
 * service. Starting a foreground service from the background is normally
 * blocked on Android 12+, but delivery of a `setAlarmClock` PendingIntent puts
 * the app on a temporary allowlist, which is precisely the window this uses.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_ID) ?: return

    // Taken before anything else and released by the service once it holds a
    // lock of its own. The system's own alarm wake lock ends when this method
    // returns, which is too early.
    AlarmWakeLock.acquire(context)

    // The label in the store is authoritative; the extra is a fallback for the
    // case where the store was wiped (app data cleared) but AlarmManager still
    // holds the PendingIntent.
    val label = AlarmStore.getPending(context, id)?.label
      ?: intent.getStringExtra(AlarmIntents.EXTRA_ALARM_LABEL)

    // This occurrence has been consumed. Repeats are re-armed by JS, which
    // owns the day-of-week rules; native never invents a next fire time.
    AlarmStore.removePending(context, id)

    val service = Intent(context, AlarmService::class.java).apply {
      action = AlarmService.ACTION_START
      putExtra(AlarmIntents.EXTRA_ALARM_ID, id)
      putExtra(AlarmIntents.EXTRA_ALARM_LABEL, label)
    }

    try {
      context.startForegroundService(service)
    } catch (t: Throwable) {
      // If the service never starts it can never release the handoff lock, so
      // that has to happen here instead. The alarm is already lost at this
      // point; the log line is the only thing that explains why.
      AlarmWakeLock.release()
      Log.e(TAG, "Could not start AlarmService — alarm $id will not ring", t)
    }
  }

  private companion object {
    const val TAG = "AlarmReceiver"
  }
}
