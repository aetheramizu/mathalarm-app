const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * AlarmCore's config plugin.
 *
 * The module's own AndroidManifest.xml declares everything AlarmCore owns —
 * permissions, the receivers, the foreground service — and the manifest merger
 * folds those into the app. The one thing it cannot declare is the app's main
 * activity, which belongs to Expo's generated manifest. That activity is the
 * target of the alarm's full-screen intent, so it needs three attributes it
 * does not get by default.
 *
 * Written as plain CommonJS rather than TypeScript so there is no build step
 * between editing the plugin and running `expo prebuild`.
 */
const withAlarmCore = (config) =>
  withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);

    // Displays the wake screen over the keyguard instead of behind it. Without
    // this the alarm rings while the lock screen stays on top, and the maths
    // challenge is unreachable.
    mainActivity.$['android:showWhenLocked'] = 'true';

    // Lights the display when the alarm fires. Paired with the service's
    // partial wake lock, which keeps the CPU running but never the screen.
    mainActivity.$['android:turnScreenOn'] = 'true';

    // Expo already defaults to singleTask, but the full-screen intent relies on
    // it: a second launch has to reach the running instance through
    // onNewIntent rather than stacking another copy of the app.
    mainActivity.$['android:launchMode'] = 'singleTask';

    return config;
  });

module.exports = withAlarmCore;
