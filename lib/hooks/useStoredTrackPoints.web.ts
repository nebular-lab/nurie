// Web では SQLite を使わず、Supabase から fetch する。ログイン状態に追随する。

import { useEffect, useState } from 'react';

import type { Point } from '../db';
import { fetchRemoteTracks, tracksToPoints, type Track } from '../remoteTracks';
import { supabase } from '../supabase';

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

    const load = async () => {
      try {
        const tracks = await fetchRemoteTracks();
        const next = tracksToPoints(tracks);
        if (cancelled) return;
        setState({ status: 'ready', points: next, tracks });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '不明なエラー';
        setState({ status: 'error', message });
      }
    };

    // 既存セッションがあれば即取得。なければログインを待つ。
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) load();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) load();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
