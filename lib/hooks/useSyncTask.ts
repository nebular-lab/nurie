import { useEffect, useRef, useState } from 'react';

import { getUnsyncedPoints, markPointsSynced } from '../db';
import { supabase } from '../supabase';

// 5 分間隔で同期する。バックグラウンドは未対応 (foreground 中だけ動く)。
// 散歩中はローカル SQLite に溜まり、アプリを開いた時にまとめて送られる前提。
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;

export type SyncStatus = {
  uploadedTotal: number;
  lastError: string | null;
};

export function useSyncTask(userId: string | null): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    uploadedTotal: 0,
    lastError: null,
  });
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

        // expo-location の timestamp は端末によって小数点付き ms が返るケースがあり、
        // Postgres の bigint に入らない。整数に丸める。
        const rows = points.map((p) => ({
          user_id: userId,
          lat: p.lat,
          lng: p.lng,
          recorded_at: Math.round(p.recordedAt),
        }));

        const { error } = await supabase.from('points').upsert(rows, {
          onConflict: 'user_id,recorded_at,lat,lng',
          ignoreDuplicates: true,
        });

        if (error) {
          setStatus((prev) => ({
            ...prev,
            lastError: `${error.message}${error.code ? ` (code: ${error.code})` : ''}`,
          }));
          return;
        }

        await markPointsSynced(points.map((p) => p.id));
        setStatus((prev) => ({
          uploadedTotal: prev.uploadedTotal + points.length,
          lastError: null,
        }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus((prev) => ({ ...prev, lastError: message }));
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

  return status;
}
