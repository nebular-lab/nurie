// 起動時に位置情報の権限を取り、バックグラウンドの記録タスクを開始する。
// 位置の使い方 (どこに表示するか) には関知しない — 記録の有効化だけが責務。

import * as Location from 'expo-location';
import { useEffect } from 'react';

import { startTracking } from '../locationTask';

export function useStartLocationTracking() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (fg.status !== 'granted') {
        console.warn('[location] foreground permission not granted', fg.status);
        return;
      }

      await Location.requestBackgroundPermissionsAsync();
      if (cancelled) return;

      await startTracking();
    })().catch((e) => console.warn('[track] startTracking failed', e));

    return () => {
      cancelled = true;
    };
  }, []);
}
