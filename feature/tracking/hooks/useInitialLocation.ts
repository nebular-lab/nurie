// 起動時に現在地を 1 度だけ取得し、その状態を 3 状態 (loading/ready/error) で返す。
// 地図はこの結果が ready になるまで描画しない (フォールバック地点を見せない) 設計のため、
// 失敗時は retry() で呼び出し側がやり直せるようにしている。

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { getCurrentCoords } from '../effect/location';

export type InitialLocationState =
  | { status: 'loading' }
  | { status: 'ready'; coords: { latitude: number; longitude: number } }
  | { status: 'error'; message: string; retry: () => void };

export function useInitialLocation(): InitialLocationState {
  const [state, setState] = useState<InitialLocationState>({ status: 'loading' });

  useEffect(() => {
    const load = () => {
      setState({ status: 'loading' });
      (async () => {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setState({
            status: 'error',
            message: '位置情報の利用が許可されていません',
            retry: load,
          });
          return;
        }
        try {
          const coords = await getCurrentCoords();
          setState({ status: 'ready', coords });
        } catch (e) {
          const message = e instanceof Error ? e.message : '不明なエラー';
          setState({ status: 'error', message, retry: load });
        }
      })();
    };
    load();
  }, []);

  return state;
}
