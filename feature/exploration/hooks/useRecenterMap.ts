// 現在地ボタン用のハンドラ。押されたら現在地を取り直して地図をそこへ寄せる。
// 失敗したら Alert で理由を表示する (ボタン操作なのに無反応はユーザーが詰まる)。

import { useCallback } from 'react';
import { Alert } from 'react-native';

import { getCurrentCoords } from '@/feature/tracking/effect/location';

type CenterMapOn = (latitude: number, longitude: number) => void;

export function useRecenterMap(centerMapOn: CenterMapOn): () => Promise<void> {
  return useCallback(async () => {
    try {
      const coords = await getCurrentCoords();
      centerMapOn(coords.latitude, coords.longitude);
    } catch (e) {
      const message = e instanceof Error ? e.message : '不明なエラー';
      Alert.alert('現在地を取得できませんでした', message);
    }
  }, [centerMapOn]);
}
