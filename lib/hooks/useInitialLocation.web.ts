// Web は閲覧専用なので、ブラウザに位置情報の許可を求めない。
// 初期表示は自宅座標 (HOME) を即時返して地図中心にする。

import { HOME } from '../constants';

export type InitialLocationState =
  | { status: 'loading' }
  | { status: 'ready'; coords: { latitude: number; longitude: number } }
  | { status: 'error'; message: string; retry: () => void };

export function useInitialLocation(): InitialLocationState {
  return {
    status: 'ready',
    coords: { latitude: HOME.lat, longitude: HOME.lng },
  };
}
