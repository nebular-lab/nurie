import { useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';

import { deleteQueuedPoints, getUnsyncedPoints, type Point } from '../db';
import { POINTS_CHANGED_EVENT } from '../pointEvents';
import { buildTrackUploadRow } from '../remoteTracks';
import { supabase } from '../supabase';

// 10 分間隔で tracks に同期する。バックグラウンドは未対応 (foreground 中だけ動く)。
// 散歩中はローカル SQLite の queued_points に溜まり、アプリを開いた時にまとめて送る。
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const TRACK_WINDOW_MS = 10 * 60 * 1000;
const BATCH_SIZE = 1000;

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
    if (!userId) {
      setStatus({ uploadedTotal: 0, lastError: null });
      return;
    }

    const currentUserId = userId;
    let cancelled = false;

    async function runSync() {
      if (
        cancelled ||
        inFlightRef.current ||
        AppState.currentState !== 'active'
      ) {
        return;
      }
      inFlightRef.current = true;
      try {
        const points = await getUnsyncedPoints(BATCH_SIZE);
        if (points.length === 0) {
          setStatus((prev) => ({ ...prev, lastError: null }));
          return;
        }

        const pointGroups = groupPointsIntoTrackWindows(points);
        const rows = pointGroups.map((group) =>
          buildTrackUploadRow(currentUserId, group),
        );

        if (cancelled || AppState.currentState !== 'active') return;

        const { error } = await supabase.from('tracks').upsert(rows, {
          onConflict: 'user_id,started_at,ended_at',
          ignoreDuplicates: true,
        });

        if (error) {
          setStatus((prev) => ({
            ...prev,
            lastError: `${error.message}${error.code ? ` (code: ${error.code})` : ''}`,
          }));
          return;
        }

        await deleteQueuedPoints(pointGroups.flatMap((group) => group.map((p) => p.id)));
        if (Platform.OS !== 'web') {
          DeviceEventEmitter.emit(POINTS_CHANGED_EVENT);
        }
        setStatus((prev) => ({
          uploadedTotal: prev.uploadedTotal + rows.length,
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
    const appSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runSync();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(id);
      appSub.remove();
    };
  }, [userId]);

  return status;
}

function groupPointsIntoTrackWindows(points: Point[]): Point[][] {
  const groups: Point[][] = [];
  let current: Point[] = [];
  let currentStartedAt = 0;

  for (const point of points) {
    if (
      current.length === 0 ||
      point.recordedAt - currentStartedAt >= TRACK_WINDOW_MS
    ) {
      current = [point];
      groups.push(current);
      currentStartedAt = point.recordedAt;
    } else {
      current.push(point);
    }
  }

  return groups;
}
