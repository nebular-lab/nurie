// 位置情報の権限取得と、ユーザーの「記録 on/off」操作を提供する。
// on/off 状態は SQLite に永続化されるので、アプリを kill しても前回の状態で復帰する。
// background 権限は得られなくても foreground だけで記録は動くので致命とはしない。

import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { getTrackingEnabled, setTrackingEnabled } from '../effect/queuedPointStore';
import { startTracking, stopTracking } from '../effect/locationTask';

export type LocationTrackingState =
  | { status: 'starting'; isEnabled: false }
  | { status: 'tracking'; isEnabled: true }
  | { status: 'paused'; isEnabled: false }
  | { status: 'error'; isEnabled: false; message: string };

export type LocationTrackingControls = {
  state: LocationTrackingState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function useLocationTracking(): LocationTrackingControls {
  const [state, setState] = useState<LocationTrackingState>({
    status: 'starting',
    isEnabled: false,
  });

  // 権限を取得しつつ、保存済みの記録 on/off 状態に合わせて OS タスクを起動／停止する。
  // 失敗は state で返して UI に出す。
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (fg.status !== 'granted') {
        setState({
          status: 'error',
          isEnabled: false,
          message: '位置情報の利用が許可されていません',
        });
        return;
      }

      await Location.requestBackgroundPermissionsAsync();
      if (cancelled) return;

      try {
        const enabled = await getTrackingEnabled();
        if (cancelled) return;
        if (enabled) {
          await startTracking();
          if (!cancelled) setState({ status: 'tracking', isEnabled: true });
        } else {
          // 前回 enable のまま kill されて OS タスクだけ残っているケースを掃除する。
          await stopTracking();
          if (!cancelled) setState({ status: 'paused', isEnabled: false });
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '不明なエラー';
        setState({ status: 'error', isEnabled: false, message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async () => {
    try {
      await startTracking();
      await setTrackingEnabled(true);
      setState({ status: 'tracking', isEnabled: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : '不明なエラー';
      setState({ status: 'error', isEnabled: false, message });
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await stopTracking();
      await setTrackingEnabled(false);
      setState({ status: 'paused', isEnabled: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : '不明なエラー';
      setState({ status: 'error', isEnabled: false, message });
    }
  }, []);

  return { state, start, stop };
}
