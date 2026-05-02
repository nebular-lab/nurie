// 起動直後に現在地を取得して地図を寄せる (1 度だけ)。
// 取得に失敗したら何もしない (MapView の initialRegion がそのまま残る)。

import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

type Options = {
  animateTo: (latitude: number, longitude: number) => void;
};

export function useCenterMapOnLaunch({ animateTo }: Options) {
  const animateToRef = useRef(animateTo);
  animateToRef.current = animateTo;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cur = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        animateToRef.current(cur.coords.latitude, cur.coords.longitude);
      } catch (e) {
        console.warn('[location] getCurrentPositionAsync failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
