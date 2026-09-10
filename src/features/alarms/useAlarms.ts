import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Alarm } from '@/data/models';
import * as alarmsRepo from '@/data/repositories/alarms';
import type { AlarmPatch, NewAlarm } from '@/data/repositories/alarms';
import * as scheduler from '@/services/alarm-scheduler';

/** How often the "in 7h 24m" line is recomputed. */
const TICK_MS = 20_000;

export type UseAlarms = {
  alarms: Alarm[];
  loading: boolean;
  /** A clock the countdown labels read, so they tick without a re-query. */
  now: number;
  create: (input: NewAlarm) => Promise<void>;
  update: (id: string, patch: AlarmPatch) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * The alarm list, and every way of changing it.
 *
 * Two rules shape this hook. Mutations go through `services/alarm-scheduler`,
 * never the repository, because every change to an alarm changes what should be
 * armed with the kernel. And a load waits for reconciliation to finish first, so
 * the list can never show an alarm as scheduled a moment before the pass that
 * decides whether it actually is.
 */
export function useAlarms(): UseAlarms {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    // Single-flight inside the service, so joining a pass already running
    // costs nothing.
    await scheduler.reconcile().catch((error) => {
      console.warn('[useAlarms] reconciliation failed', error);
    });

    const rows = await alarmsRepo.listAll();
    if (!mounted.current) return;
    setAlarms(rows);
    setNow(Date.now());
    setLoading(false);
  }, []);

  // On arrival at the tab, not merely on mount: the list is stale after a
  // dismissal on the wake screen, which re-arms the alarm that just rang.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const create = useCallback(
    async (input: NewAlarm) => {
      await scheduler.createAlarm(input);
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, patch: AlarmPatch) => {
      await scheduler.updateAlarm(id, patch);
      await refresh();
    },
    [refresh]
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      // Optimistic, because a toggle that waits on a native call before moving
      // feels broken. `refresh` reconciles it back to the truth either way.
      setAlarms((current) =>
        current.map((alarm) => (alarm.id === id ? { ...alarm, enabled } : alarm))
      );
      try {
        await scheduler.setAlarmEnabled(id, enabled);
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await scheduler.deleteAlarm(id);
      await refresh();
    },
    [refresh]
  );

  return { alarms, loading, now, create, update, setEnabled, remove, refresh };
}
