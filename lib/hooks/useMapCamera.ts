// MapView の命令型 API (animateToRegion) を React 風のフックに包む。
// MapView が onMapReady を発火する前に animateTo が呼ばれることがあるので、
// その場合は ref に積んでおき、ready になった時点で実行する (キュー)。
// pending の保存に state ではなく ref を使うのは、これが描画に関係しない一時的な値で、
// 更新で再レンダリングを起こす必要がないため。

import { useCallback, useRef } from 'react';
import type MapView from 'react-native-maps';

const ZOOM_16 = {
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

type Coord = { latitude: number; longitude: number };

export function useMapCamera() {
  const mapRef = useRef<MapView>(null);
  const readyRef = useRef(false);
  const pendingRegionRef = useRef<Coord | null>(null);

  const animateTo = useCallback((latitude: number, longitude: number) => {
    if (!readyRef.current) {
      pendingRegionRef.current = { latitude, longitude };
      return;
    }
    mapRef.current?.animateToRegion({ latitude, longitude, ...ZOOM_16 }, 500);
  }, []);

  const onMapReady = useCallback(() => {
    readyRef.current = true;
    const region = pendingRegionRef.current;
    pendingRegionRef.current = null;
    if (region) {
      mapRef.current?.animateToRegion({ ...region, ...ZOOM_16 }, 500);
    }
  }, []);

  return { mapRef, animateTo, onMapReady };
}
