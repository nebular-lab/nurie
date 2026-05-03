// 起動時に位置情報の権限を取り、バックグラウンドの記録タスクを開始する。
// 失敗 (権限拒否や startTracking のエラー) は state として返し、UI 側で表示する責務にする。
// background 権限は得られなくても foreground だけで記録は動くので致命とはしない。

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { startTracking } from '../locationTask';

export type LocationTrackingState =
  | { status: 'starting' }
  | { status: 'tracking' }
  | { status: 'error'; message: string };

export function useStartLocationTracking(): LocationTrackingState {
  const [state, setState] = useState<LocationTrackingState>({ status: 'starting' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (fg.status !== 'granted') {
        setState({
          status: 'error',
          message: '位置情報の利用が許可されていません',
        });
        return;
      }

      await Location.requestBackgroundPermissionsAsync();
      if (cancelled) return;

      try {
        await startTracking();
        if (!cancelled) setState({ status: 'tracking' });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '不明なエラー';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
