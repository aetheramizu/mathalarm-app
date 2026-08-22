package com.mathalarm.alarmcore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Everything that happens between "the alarm went off" and "the user solved
 * the maths": the foreground notification carrying the full-screen intent,
 * alarm-stream audio, and vibration.
 *
 * It is a foreground service rather than plain work inside the receiver
 * because the ringing has to outlive the receiver's ten-second budget and keep
 * running while the user stares at a maths problem.
 */
class AlarmService : Service() {

  companion object {
    private const val TAG = "AlarmService"

    const val ACTION_START = "com.mathalarm.alarmcore.action.START"
    const val ACTION_DISMISS = "com.mathalarm.alarmcore.action.DISMISS"

    /** In-process broadcasts the module listens for while JS is alive. */
    const val EVENT_FIRED = "com.mathalarm.alarmcore.event.FIRED"
    const val EVENT_DISMISSED = "com.mathalarm.alarmcore.event.DISMISSED"

    const val REASON_SOLVED = "solved"
    const val REASON_CANCELLED = "cancelled"
    const val REASON_SYSTEM_STOPPED = "systemStopped"

    private const val CHANNEL_ID = "mathalarm.alarm"
    private const val NOTIFICATION_ID = 0x4D41

    /**
     * A ceiling, not a schedule. Nothing should hold the CPU for ten minutes,
     * but an unsolved alarm must not be quietly killed either.
     */
    private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L

    /** Asks a running service to stop ringing. Safe to call when idle. */
    fun dismiss(context: Context, id: String, reason: String) {
      val intent = Intent(context, AlarmService::class.java).apply {
        action = ACTION_DISMISS
        putExtra(AlarmIntents.EXTRA_ALARM_ID, id)
        putExtra(AlarmIntents.EXTRA_REASON, reason)
      }
      context.startService(intent)
    }
  }

  private var activeId: String? = null
  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var audioFocusRequest: AudioFocusRequest? = null

  /** Set only when this service raised a muted alarm stream, so it can undo it. */
  private var restoreAlarmVolume: Int? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Bound to a local first: `when (intent?.action)` would leave `intent`
    // nullable inside every branch, and the branches need the intent itself.
    val action = intent?.action

    if (intent == null || action == null) {
      // Restarted by the system with a null intent, and nothing is ringing:
      // there is no state to rebuild, so leave rather than sit in the
      // foreground doing nothing.
      if (activeId == null) stopSelf()
      return START_NOT_STICKY
    }

    when (action) {
      ACTION_START ->
        try {
          start(intent)
        } finally {
          // Whatever happened in start(), the receiver's handoff lock has done
          // its job by now — either this service holds its own, or it failed
          // and is about to stop.
          AlarmWakeLock.release()
        }

      ACTION_DISMISS -> {
        val reason = intent.getStringExtra(AlarmIntents.EXTRA_REASON) ?: REASON_SOLVED
        val target = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_ID)
        // A dismiss aimed at some other alarm is stale — typically a late call
        // for an alarm that already stopped.
        if (target == null || target == activeId) stopRinging(reason)
      }

      else -> if (activeId == null) stopSelf()
    }

    // Deliberately not sticky. If the system kills us mid-ring it is under
    // memory pressure, and being resurrected with a null intent would only
    // produce a notification with nothing behind it.
    return START_NOT_STICKY
  }

  private fun start(intent: Intent) {
    val id = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_ID)
    if (id == null) {
      stopSelf()
      return
    }
    val label = intent.getStringExtra(AlarmIntents.EXTRA_ALARM_LABEL)

    // Duplicate delivery of the same alarm — some OEM builds do this — must not
    // restart audio or stack a second vibration pattern.
    if (activeId == id) return

    activeId = id
    val firedAtMs = System.currentTimeMillis()
    AlarmStore.setActive(this, ActiveAlarm(id = id, label = label, firedAtMs = firedAtMs))

    // Ring even if the foreground promotion was refused. A service the system
    // is about to kill still makes noise for a few seconds, and noise plus an
    // error in the log is a far better outcome than silence — the rig will
    // report it as a `systemStopped` dismissal moments later.
    val foregrounded = goToForeground(id, label)
    acquireWakeLock()
    startAudio()
    startVibration()

    if (!foregrounded) {
      Log.e(TAG, "Alarm $id is ringing without foreground status and will not survive")
    }

    sendBroadcast(
      Intent(EVENT_FIRED)
        .setPackage(packageName)
        .putExtra(AlarmIntents.EXTRA_ALARM_ID, id)
        .putExtra(AlarmIntents.EXTRA_ALARM_LABEL, label)
        .putExtra(AlarmIntents.EXTRA_FIRED_AT, firedAtMs)
    )
  }

  private fun stopRinging(reason: String) {
    val id = activeId
    if (id == null) {
      stopSelf()
      return
    }
    activeId = null

    stopAudio()
    stopVibration()
    releaseWakeLock()
    AlarmStore.clearActive(this)

    sendBroadcast(
      Intent(EVENT_DISMISSED)
        .setPackage(packageName)
        .putExtra(AlarmIntents.EXTRA_ALARM_ID, id)
        .putExtra(AlarmIntents.EXTRA_REASON, reason)
    )

    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    // Reaching here with an alarm still active means the system tore us down
    // rather than the user solving anything. Report that honestly so JS can
    // tell a real dismissal from a kill.
    if (activeId != null) stopRinging(REASON_SYSTEM_STOPPED)
    super.onDestroy()
  }

  // --- Foreground notification ---------------------------------------------

  /**
   * Returns whether the service actually reached the foreground.
   *
   * Android 14+ throws rather than degrading when a foreground service type is
   * not permitted at that moment, and OEM builds vary in what they permit. An
   * uncaught throw here would surface as "the alarm silently did nothing",
   * which is indistinguishable from every other failure mode. Catching it costs
   * nothing and turns a mystery into one log line.
   */
  private fun goToForeground(id: String, label: String?): Boolean =
    try {
      val notification = buildNotification(id, label)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (t: Throwable) {
      Log.e(TAG, "startForeground rejected for alarm $id — no wake screen will appear", t)
      false
    }

  private fun buildNotification(id: String, label: String?): Notification {
    ensureChannel()

    val wakeScreen = wakeScreenIntent(id)

    val builder = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(label?.takeIf { it.isNotBlank() } ?: "Alarm")
      .setContentText("Solve to dismiss")
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      // Ongoing, no delete intent, not auto-cancelling: the notification must
      // not become a way out of the alarm. Solving the maths is the only exit.
      .setOngoing(true)
      .setAutoCancel(false)

    if (wakeScreen != null) {
      builder.setContentIntent(wakeScreen)
      // The `true` flag marks this as a high-priority interruption, which is
      // what makes the system launch the activity rather than show a heads-up.
      builder.setFullScreenIntent(wakeScreen, true)
    }

    return builder.build()
  }

  /**
   * The full-screen intent targets the app's own launcher activity. The config
   * plugin marks that activity `showWhenLocked` + `turnScreenOn`, so it comes
   * up over the keyguard with the screen lit, and SINGLE_TOP makes an already
   * running instance receive the alarm id through `onNewIntent` instead of
   * being recreated underneath whatever is on screen.
   */
  private fun wakeScreenIntent(id: String): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launch.putExtra(AlarmIntents.EXTRA_ALARM_ID, id)

    return PendingIntent.getActivity(
      this,
      id.hashCode(),
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun ensureChannel() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Alarms",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Ringing alarms that require a maths answer to dismiss"
      // The service owns playback on the alarm stream, so the channel itself
      // stays silent — otherwise two sounds would overlap.
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      // Only takes effect once the user grants Do Not Disturb access; harmless
      // otherwise, and it is the difference between waking up and not.
      setBypassDnd(true)
    }
    manager.createNotificationChannel(channel)
  }

  // --- Wake lock ------------------------------------------------------------

  private fun acquireWakeLock() {
    if (wakeLock != null) return
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    // PARTIAL only: keeping the CPU alive is this service's job, while lighting
    // the screen belongs to the activity's `turnScreenOn` attribute. The
    // screen-related wake lock flags have been deprecated since API 17.
    val lock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "MathAlarm:AlarmService"
    )
    lock.acquire(WAKE_LOCK_TIMEOUT_MS)
    wakeLock = lock
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  // --- Audio ----------------------------------------------------------------

  private fun startAudio() {
    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    unmuteAlarmStreamIfSilenced(audioManager)

    // USAGE_ALARM is what actually beats silent mode: the alarm stream ignores
    // ringer mode entirely. This is the capability no JS audio library exposes,
    // and the reason this module exists.
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    requestAudioFocus(audioManager, attributes)

    val uri = alarmSoundUri()
    if (uri == null) {
      Log.w(TAG, "No alarm or ringtone sound available; vibration only")
      return
    }

    val player = MediaPlayer()
    try {
      player.setAudioAttributes(attributes)
      player.isLooping = true
      player.setOnErrorListener { _, what, extra ->
        Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra)
        true
      }
      player.setDataSource(this, uri)
      player.prepare()
      player.start()
      mediaPlayer = player
    } catch (t: Throwable) {
      // Vibration and the full-screen wake screen still work without audio, so
      // a bad ringtone URI degrades the alarm rather than killing it.
      Log.e(TAG, "Failed to start alarm audio", t)
      player.release()
    }
  }

  private fun stopAudio() {
    mediaPlayer?.let { player ->
      try {
        if (player.isPlaying) player.stop()
      } catch (t: IllegalStateException) {
        Log.w(TAG, "MediaPlayer was not in a stoppable state", t)
      }
      player.release()
    }
    mediaPlayer = null

    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    audioFocusRequest = null

    restoreAlarmVolume?.let { original ->
      try {
        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, original, 0)
      } catch (t: SecurityException) {
        Log.w(TAG, "Could not restore alarm volume", t)
      }
    }
    restoreAlarmVolume = null
  }

  private fun requestAudioFocus(audioManager: AudioManager, attributes: AudioAttributes) {
    // EXCLUSIVE rather than plain GAIN: music and podcasts should be paused
    // outright, not ducked under the alarm.
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
      .setAudioAttributes(attributes)
      .build()
    audioFocusRequest = request
    audioManager.requestAudioFocus(request)
  }

  /**
   * The alarm stream is exempt from silent and vibrate mode, but the user can
   * still drag its own slider to zero. That is almost never a deliberate "do
   * not wake me", so the stream is raised for the duration of the ring and the
   * original value is restored on dismissal.
   */
  private fun unmuteAlarmStreamIfSilenced(audioManager: AudioManager) {
    val current = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
    if (current > 0) return

    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
    val raised = ((max * 0.7f).toInt()).coerceAtLeast(1)
    restoreAlarmVolume = current
    try {
      audioManager.setStreamVolume(AudioManager.STREAM_ALARM, raised, 0)
    } catch (t: SecurityException) {
      // Blocked by a Do Not Disturb policy we do not have access to change.
      Log.w(TAG, "Could not raise a silenced alarm stream", t)
      restoreAlarmVolume = null
    }
  }

  /** Falls back through the sounds a device is most likely to actually have. */
  private fun alarmSoundUri(): Uri? =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

  // --- Vibration ------------------------------------------------------------

  private fun startVibration() {
    val vibrator = vibrator() ?: return
    if (!vibrator.hasVibrator()) return

    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    // Repeat index 0 replays the whole pattern indefinitely; it stops only when
    // the service cancels it.
    val pattern = longArrayOf(0, 600, 400)
    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), attributes)
  }

  private fun stopVibration() {
    vibrator()?.cancel()
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
}
