// 起動時に現在地を 1 度だけ取得し、その状態を 3 状態 (loading/ready/error) で返す。
// 地図はこの結果が ready になるまで描画しない (フォールバック地点を見せない) 設計のため、
// 失敗時は retry() で呼び出し側がやり直せるようにしている。

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { getCurrentCoords } from '../location';

export type InitialLocationState =
  | { status: 'loading' }
  | { status: 'ready'; coords: { latitude: number; longitude: number } }
  | { status: 'error'; retry: () => void };

export function useInitialLocation(): InitialLocationState {
  const [state, setState] = useState<InitialLocationState>({ status: 'loading' });

  useEffect(() => {
    const load = () => {
      setState({ status: 'loading' });
      (async () => {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setState({ status: 'error', retry: load });
          return;
        }
        const coords = await getCurrentCoords();
        if (coords) {
          setState({ status: 'ready', coords });
        } else {
          setState({ status: 'error', retry: load });
        }
      })();
    };
    load();
  }, []);

  return state;
}
