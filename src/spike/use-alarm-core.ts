import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import AlarmCore, {
  type ActiveAlarm,
  type AlarmPermissionStatus,
} from '../../modules/alarm-core';

export type LogEntry = {
  key: string;
  at: number;
  level: 'info' | 'ok' | 'alert';
  text: string;
};

const LOG_LIMIT = 80;

/**
 * All of the rig's conversation with the native module in one place.
 *
 * The important detail is that state is refreshed from three independent
 * triggers, not one: native events (only useful while JS is alive), app
 * foreground (the path taken when the full-screen intent launches the app
 * cold), and explicit pulls. An alarm normally fires while this JS context does
 * not exist, so anything that relies on the event alone would miss it.
 */
export function useAlarmCore() {
  const [permissions, setPermissions] = useState<AlarmPermissionStatus | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);
  const [scheduledIds, setScheduledIds] = useState<string[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);

  const sequence = useRef(0);

  const append = useCallback((level: LogEntry['level'], text: string) => {
    sequence.current += 1;
    const entry: LogEntry = {
      key: `${Date.now()}-${sequence.current}`,
      at: Date.now(),
      level,
      text,
    };
    setLog((previous) => [entry, ...previous].slice(0, LOG_LIMIT));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [status, ids, active] = await Promise.all([
        AlarmCore.getPermissionStatus(),
        AlarmCore.getScheduledAlarmIds(),
        AlarmCore.getActiveAlarm(),
      ]);
      setPermissions(status);
      setScheduledIds(ids);
      setActiveAlarm(active);
    } catch (error) {
      append('alert', `refresh failed — ${describe(error)}`);
    }
  }, [append]);

  // --- Native events -------------------------------------------------------

  useEffect(() => {
    const fired = AlarmCore.addListener('onAlarmFired', (payload) => {
      append('ok', `FIRED ${payload.id}${payload.label ? ` "${payload.label}"` : ''}`);
      setActiveAlarm({
        id: payload.id,
        label: payload.label,
        firedAtMs: payload.firedAtMs,
      });
      void refresh();
    });

    const dismissed = AlarmCore.addListener('onAlarmDismissed', (payload) => {
      append(
        payload.reason === 'solved' ? 'ok' : 'alert',
        `DISMISSED ${payload.id} (${payload.reason})`
      );
      setActiveAlarm(null);
      void refresh();
    });

    return () => {
      fired.remove();
      dismissed.remove();
    };
  }, [append, refresh]);

  // --- Foreground + first load --------------------------------------------

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // --- Actions -------------------------------------------------------------

  const arm = useCallback(
    async (offsetSeconds: number) => {
      const id = `spike-${Date.now()}`;
      const triggerAtMs = Date.now() + offsetSeconds * 1000;
      try {
        await AlarmCore.scheduleAlarm({
          id,
          triggerAtMs,
          label: `Spike +${offsetSeconds}s`,
        });
        append('info', `ARMED ${id} for ${clockOf(triggerAtMs)}`);
      } catch (error) {
        append('alert', `arm failed — ${describe(error)}`);
      }
      await refresh();
    },
    [append, refresh]
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await AlarmCore.cancelAlarm(id);
        append('info', `CANCELLED ${id}`);
      } catch (error) {
        append('alert', `cancel failed — ${describe(error)}`);
      }
      await refresh();
    },
    [append, refresh]
  );

  const dismiss = useCallback(
    async (id: string) => {
      try {
        await AlarmCore.dismissAlarm(id);
      } catch (error) {
        append('alert', `dismiss failed — ${describe(error)}`);
      }
      // Clear locally rather than waiting for the native broadcast: the wake
      // screen must come down the instant the answer lands, and the event is a
      // confirmation, not the trigger.
      setActiveAlarm(null);
      await refresh();
    },
    [append, refresh]
  );

  const request = useCallback(
    async (which: keyof AlarmPermissionStatus) => {
      try {
        switch (which) {
          case 'canPostNotifications': {
            const granted = await AlarmCore.requestNotificationsPermission();
            append(granted ? 'ok' : 'alert', `notifications ${granted ? 'granted' : 'denied'}`);
            break;
          }
          case 'canScheduleExactAlarms':
            await AlarmCore.requestExactAlarmPermission();
            append('info', 'opened exact-alarm settings');
            break;
          case 'canUseFullScreenIntent':
            await AlarmCore.requestFullScreenIntentPermission();
            append('info', 'opened full-screen-intent settings');
            break;
          case 'isIgnoringBatteryOptimizations':
            await AlarmCore.requestIgnoreBatteryOptimizations();
            append('info', 'opened battery-optimisation settings');
            break;
        }
      } catch (error) {
        append('alert', `request failed — ${describe(error)}`);
      }
      // Everything except notifications resolves the moment the settings screen
      // opens, so the real answer only arrives on the next foreground refresh.
    },
    [append]
  );

  return { permissions, activeAlarm, scheduledIds, log, refresh, arm, cancel, dismiss, request };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function clockOf(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
