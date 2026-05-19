import { useEffect, useRef } from 'react';

import { getUnsyncedPoints, markPointsSynced } from '../db';
import { supabase } from '../supabase';

// 5 分間隔で同期する。バックグラウンドは未対応 (foreground 中だけ動く)。
// 散歩中はローカル SQLite に溜まり、アプリを開いた時にまとめて送られる前提。
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;

export function useSyncTask(userId: string | null) {
  // 直前の sync が動いている間に重ねて発火しないようにするロック。
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function runSync() {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const points = await getUnsyncedPoints(BATCH_SIZE);
        if (points.length === 0) return;

        const rows = points.map((p) => ({
          user_id: userId,
          lat: p.lat,
          lng: p.lng,
          recorded_at: p.recordedAt,
        }));

        const { error } = await supabase.from('points').upsert(rows, {
          onConflict: 'user_id,recorded_at,lat,lng',
          ignoreDuplicates: true,
        });

        if (error) {
          console.warn('[sync] upsert failed', error.message);
          return;
        }

        await markPointsSynced(points.map((p) => p.id));
      } catch (e) {
        console.warn('[sync] error', e);
      } finally {
        inFlightRef.current = false;
      }
    }

    runSync();
    const id = setInterval(runSync, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId]);
}
