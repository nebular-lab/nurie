// 現在地ボタン用のハンドラ。押されたら現在地を取り直して地図をそこへ寄せる。
// 取得失敗時は黙ってスキップする (起動時のような厳格な扱いは不要 — 単なるユーザー操作なので)。

import { useCallback } from 'react';

import { getCurrentCoords } from '../location';

type CenterMapOn = (latitude: number, longitude: number) => void;

export function useRecenterMap(centerMapOn: CenterMapOn): () => Promise<void> {
  return useCallback(async () => {
    const coords = await getCurrentCoords();
    if (coords) centerMapOn(coords.latitude, coords.longitude);
  }, [centerMapOn]);
}
