// SQLite に貯まっている点を React state として保持する。
// バックグラウンドのタスク (lib/locationTask.ts) が DB に追記しても React は気付けないので、
// アプリがフォアグラウンドに戻ったタイミング (AppState 'active') で再ロードして同期する。

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAllPoints, type Point } from '../db';

export function useStoredTrackPoints(): Point[] {
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    const reload = async () => {
      try {
        setPoints(await getAllPoints());
      } catch (e) {
        console.warn('[track] getAllPoints failed', e);
      }
    };
    reload();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => sub.remove();
  }, []);

  return points;
}
