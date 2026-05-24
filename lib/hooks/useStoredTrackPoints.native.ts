import { useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';

import { getAllPoints, type Point } from '../db';
import { POINTS_CHANGED_EVENT } from '../pointEvents';
import {
  fetchRemoteTracks,
  reindexPoints,
  tracksToPoints,
  type Track,
} from '../remoteTracks';
import { supabase } from '../supabase';

// foreground 中の追記イベントは連続発火するので、まとめて 1 回だけ DB を読む。
const RELOAD_DEBOUNCE_MS = 1000;

export type StoredTrackPointsState =
  | { status: 'loading' }
  | { status: 'ready'; points: Point[]; tracks: Track[] }
  | { status: 'error'; message: string };

export function useStoredTrackPoints(): StoredTrackPointsState {
  const [state, setState] = useState<StoredTrackPointsState>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reload = async () => {
      try {
        const [{ data }, queuedPoints] = await Promise.all([
          supabase.auth.getSession(),
          getAllPoints(),
        ]);
        const remoteTracks = data.session ? await fetchRemoteTracks() : [];
        const queuedTracks = buildQueuedTracks(queuedPoints);
        const nextTracks = [...remoteTracks, ...queuedTracks];
        const next = reindexPoints([
          ...tracksToPoints(remoteTracks),
          ...queuedPoints,
        ]);
        if (cancelled) return;
        // 末尾 id と件数が同じなら同じ点列とみなして参照を維持し、下流の useMemo を起こさない。
        setState((prev) => {
          if (prev.status === 'ready') {
            const prevPoints = prev.points;
            if (
              next.length === prevPoints.length &&
              next.at(-1)?.id === prevPoints.at(-1)?.id
            ) {
              return prev;
            }
          }
          return { status: 'ready', points: next, tracks: nextTracks };
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '不明なエラー';
        setState({ status: 'error', message });
      }
    };

    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        reload();
      }, RELOAD_DEBOUNCE_MS);
    };

    reload();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reload();
    });
    const pointSub = DeviceEventEmitter.addListener(
      POINTS_CHANGED_EVENT,
      scheduleReload,
    );
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      scheduleReload();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appSub.remove();
      pointSub.remove();
      authSub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function buildQueuedTracks(points: Point[]): Track[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.recordedAt - b.recordedAt);
  return [
    {
      id: 'queued',
      startedAt: sorted[0].recordedAt,
      endedAt: sorted.at(-1)?.recordedAt ?? sorted[0].recordedAt,
      path: {
        type: 'LineString',
        coordinates: sorted.map((p) => [p.lng, p.lat]),
      },
    },
  ];
}
