// 自宅周辺の歩ける道路データ (バンドル同梱の静的データ) をロードする。

import { useEffect, useState } from 'react';

import { loadWalkableRoads, type WalkableRoad } from '../walkableRoads';

export type WalkableRoadsState =
  | { status: 'loading' }
  | { status: 'ready'; list: WalkableRoad[] }
  | { status: 'error'; message: string; retry: () => void };

export function useWalkableRoads(): WalkableRoadsState {
  const [state, setState] = useState<WalkableRoadsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: 'loading' });
      try {
        const list = await loadWalkableRoads();
        if (!cancelled) setState({ status: 'ready', list });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '不明なエラー';
        setState({
          status: 'error',
          message,
          retry: () => load(),
        });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
