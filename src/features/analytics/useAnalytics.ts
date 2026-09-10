import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WakeSession } from '@/data/models';
import * as sessionsRepo from '@/data/repositories/sessions';
import { summarise, type AnalyticsSummary } from '@/domain/analytics/metrics';

/** How many rows the history list shows before it stops being a list and starts being a log. */
const RECENT_LIMIT = 25;

export function useAnalytics(): {
  summary: AnalyticsSummary | null;
  recent: WakeSession[];
  loading: boolean;
} {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<WakeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      // Every closed session, not just the last 30 days: the streak is all-time
      // history and would be truncated by a windowed query. One row per alarm
      // that rings is a few hundred rows a year, so this stays cheap.
      const sessions = await sessionsRepo.listSince(0);
      if (!mounted.current) return;
      setSummary(summarise(sessions, Date.now()));
      setRecent(sessions.slice(0, RECENT_LIMIT));
    } catch (error) {
      console.warn('[analytics] could not load sessions', error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // On focus, so a wake-up solved thirty seconds ago is already in the numbers
  // by the time the user comes to look at them.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { summary, recent, loading };
}
