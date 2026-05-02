// SQLite に貯まっている点を React state として保持する。
// バックグラウンドのタスク (lib/locationTask.ts) が DB に追記しても React は気付けないので、
// アプリがフォアグラウンドに戻ったタイミング (AppState 'active') で再ロードして同期する。

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAllPoints, type Point } from '../db';

export function useTrackPoints() {
  const [points, setPoints] = useState<Point[]>([]);

  const reload = useCallback(async () => {
    try {
      setPoints(await getAllPoints());
    } catch (e) {
      console.warn('[track] getAllPoints failed', e);
    }
  }, []);

  // 初回ロードと AppState 購読は寿命が同じ (マウント中ずっと有効) なので 1 つの effect にまとめる。
  useEffect(() => {
    reload();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => sub.remove();
  }, [reload]);

  return { points, reload };
}
