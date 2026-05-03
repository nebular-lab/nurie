// 自宅周辺の OSM 道路をロードする。
// キャッシュ済みなら即時 (Overpass を叩かない)、無ければネットワーク取得。

import { useEffect, useState } from 'react';

import { AREA_RADIUS_M, HOME } from '../constants';
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
        const roads = await loadOsmRoads(HOME.lat, HOME.lng, AREA_RADIUS_M);
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
