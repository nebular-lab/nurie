// 地図のセンタリングをまとめて担う:
//  - 起動直後に現在地へ寄せる (1 度だけ。失敗時は何もしない)
//  - ユーザーが現在地ボタンを押した時の recenter ハンドラを返す

import { useCallback, useEffect } from 'react';

import { getCurrentCoords } from '../location';

type CenterMapOn = (latitude: number, longitude: number) => void;

export function useMapCentering(centerMapOn: CenterMapOn): () => Promise<void> {
  useEffect(() => {
    let cancelled = false;
    getCurrentCoords().then((coords) => {
      if (cancelled || !coords) return;
      centerMapOn(coords.latitude, coords.longitude);
    });
    return () => {
      cancelled = true;
    };
  }, [centerMapOn]);

  return useCallback(async () => {
    const coords = await getCurrentCoords();
    if (coords) centerMapOn(coords.latitude, coords.longitude);
  }, [centerMapOn]);
}
