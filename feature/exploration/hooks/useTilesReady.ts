import { useEffect, useState } from 'react';

// UrlTile に「読み込み完了」コールバックは無いので、onMapReady から少し遅延させて
// 読み込み完了とみなす。Apple Maps の基底タイルが一瞬チラつくのを白オーバーレイで隠すため。
const TILES_READY_DELAY_MS = 1200;

export function useTilesReady(mapReady: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapReady) return;
    const timer = setTimeout(() => setReady(true), TILES_READY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mapReady]);

  return ready;
}
