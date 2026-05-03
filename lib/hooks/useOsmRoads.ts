// 自宅周辺の道路データ (バンドル同梱の静的データ) をロードする。

import { useEffect, useState } from 'react';

import { loadOsmRoads, type OsmRoad } from '../osm';

export type OsmRoadsState =
  | { status: 'loading' }
  | { status: 'ready'; roads: OsmRoad[] }
  | { status: 'error'; message: string; retry: () => void };

export function useOsmRoads(): OsmRoadsState {
  const [state, setState] = useState<OsmRoadsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: 'loading' });
      try {
        const roads = await loadOsmRoads();
        if (!cancelled) setState({ status: 'ready', roads });
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
