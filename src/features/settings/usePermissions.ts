import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as permissions from '@/services/permissions';
import type { PermissionKey, PermissionStatus } from '@/services/permissions';

/**
 * Live permission state.
 *
 * Re-read on focus and on every return to the foreground, because three of the
 * four are granted on a system settings screen the app cannot observe: the user
 * leaves, changes something, and comes back, and the only honest moment to find
 * out is when they do.
 */
export function usePermissions(): {
  status: PermissionStatus;
  loading: boolean;
  request: (key: PermissionKey) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<PermissionStatus>(permissions.UNKNOWN_STATUS);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await permissions.getStatus();
      if (mounted.current) setStatus(next);
    } catch (error) {
      console.warn('[permissions] could not read status', error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

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

  const request = useCallback(
    async (key: PermissionKey) => {
      await permissions.request(key);
      // Worth doing for the notifications dialog, which does resolve in
      // process. For the other three the foreground listener above is what
      // eventually tells the truth.
      await refresh();
    },
    [refresh]
  );

  return { status, loading, request, refresh };
}
