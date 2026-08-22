package com.mathalarm.alarmcore

import android.content.Context
import android.os.PowerManager
import android.util.Log

/**
 * Holds the CPU awake across the handoff from `AlarmReceiver` to `AlarmService`.
 *
 * Android holds its own wake lock while delivering an alarm broadcast, but that
 * lock is released when `onReceive` returns — which is before the service has
 * started, let alone taken a lock of its own. On a well-behaved device the gap
 * closes harmlessly. On an aggressively power-managed OEM build it is a window
 * in which the device can go back to sleep and the alarm simply never rings,
 * with nothing in the logs to say why.
 *
 * Static because the two halves are different objects in the same process with
 * no reference to each other. Reference counting is off: the service releases
 * once, unconditionally, no matter how the receiver got here.
 */
internal object AlarmWakeLock {
  private const val TAG = "AlarmWakeLock"
  private const val LOCK_TAG = "MathAlarm:Handoff"

  /**
   * Generous, because it is a backstop rather than a budget — the service
   * releases this within milliseconds in the normal path. It exists only so a
   * crash between the two halves cannot strand a lock and drain the battery.
   */
  private const val TIMEOUT_MS = 60_000L

  private var lock: PowerManager.WakeLock? = null

  @Synchronized
  fun acquire(context: Context) {
    if (lock?.isHeld == true) return
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val acquired = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, LOCK_TAG)
    acquired.setReferenceCounted(false)
    acquired.acquire(TIMEOUT_MS)
    lock = acquired
  }

  @Synchronized
  fun release() {
    try {
      lock?.let { if (it.isHeld) it.release() }
    } catch (t: RuntimeException) {
      // Already released by the timeout. Nothing to do, and certainly nothing
      // worth crashing a ringing alarm over.
      Log.w(TAG, "Handoff wake lock was already released", t)
    }
    lock = null
  }
}
