package com.mathalarm.alarmcore

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/** One alarm that AlarmManager is holding for us. */
internal data class PendingAlarm(
  val id: String,
  val triggerAtMs: Long,
  val label: String?
)

/** The alarm that is ringing right now, if any. */
internal data class ActiveAlarm(
  val id: String,
  val label: String?,
  val firedAtMs: Long
)

/**
 * The native side's own record of what it has scheduled.
 *
 * JS owns the real alarm database; this store exists only so the native half
 * can answer two questions without a running JS context: "what should I put
 * back after a reboot?" and "what is ringing?".
 *
 * It deliberately uses device-protected storage. A `LOCKED_BOOT_COMPLETED`
 * receiver runs before the user has unlocked the device for the first time,
 * and credential-encrypted storage — where SharedPreferences normally lives —
 * is simply not readable at that point.
 */
internal object AlarmStore {
  private const val PREFS_NAME = "alarm-core"
  private const val KEY_PENDING = "pending"
  private const val KEY_ACTIVE = "active"

  private const val FIELD_TRIGGER_AT = "triggerAtMs"
  private const val FIELD_LABEL = "label"
  private const val FIELD_ID = "id"
  private const val FIELD_FIRED_AT = "firedAtMs"

  private fun prefs(context: Context): SharedPreferences =
    context.createDeviceProtectedStorageContext()
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun readPending(context: Context): JSONObject =
    JSONObject(prefs(context).getString(KEY_PENDING, "{}") ?: "{}")

  private fun writePending(context: Context, json: JSONObject) {
    // commit(), not apply(): callers are BroadcastReceivers and Services whose
    // process can be killed the moment onReceive returns.
    prefs(context).edit().putString(KEY_PENDING, json.toString()).commit()
  }

  fun putPending(context: Context, alarm: PendingAlarm) {
    val root = readPending(context)
    root.put(
      alarm.id,
      JSONObject()
        .put(FIELD_TRIGGER_AT, alarm.triggerAtMs)
        .put(FIELD_LABEL, alarm.label)
    )
    writePending(context, root)
  }

  fun removePending(context: Context, id: String) {
    val root = readPending(context)
    if (!root.has(id)) return
    root.remove(id)
    writePending(context, root)
  }

  fun getPending(context: Context, id: String): PendingAlarm? {
    val entry = readPending(context).optJSONObject(id) ?: return null
    return PendingAlarm(
      id = id,
      triggerAtMs = entry.optLong(FIELD_TRIGGER_AT),
      label = entry.optString(FIELD_LABEL).takeIf { it.isNotEmpty() }
    )
  }

  fun allPending(context: Context): List<PendingAlarm> {
    val root = readPending(context)
    return root.keys().asSequence().mapNotNull { id ->
      root.optJSONObject(id)?.let { entry ->
        PendingAlarm(
          id = id,
          triggerAtMs = entry.optLong(FIELD_TRIGGER_AT),
          label = entry.optString(FIELD_LABEL).takeIf { it.isNotEmpty() }
        )
      }
    }.toList()
  }

  fun setActive(context: Context, alarm: ActiveAlarm) {
    val json = JSONObject()
      .put(FIELD_ID, alarm.id)
      .put(FIELD_LABEL, alarm.label)
      .put(FIELD_FIRED_AT, alarm.firedAtMs)
    prefs(context).edit().putString(KEY_ACTIVE, json.toString()).commit()
  }

  fun clearActive(context: Context) {
    prefs(context).edit().remove(KEY_ACTIVE).commit()
  }

  /**
   * Survives process death on purpose: if the app is killed while ringing and
   * relaunched from the notification, JS still needs to know which alarm it is
   * being asked to unlock.
   */
  fun getActive(context: Context): ActiveAlarm? {
    val raw = prefs(context).getString(KEY_ACTIVE, null) ?: return null
    val json = runCatching { JSONObject(raw) }.getOrNull() ?: return null
    val id = json.optString(FIELD_ID).takeIf { it.isNotEmpty() } ?: return null
    return ActiveAlarm(
      id = id,
      label = json.optString(FIELD_LABEL).takeIf { it.isNotEmpty() },
      firedAtMs = json.optLong(FIELD_FIRED_AT)
    )
  }
}
