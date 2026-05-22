import { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import type { CoverageResult } from '../coverage';

import { WALKED_ROAD_STYLE } from './mapOverlayStyle';

// 過去 → 今日 の順で重ねる。歩行履歴の更新でだけ再生成。
export function WalkedRoadsOverlay({
  coverage,
}: {
  coverage: CoverageResult | null;
}) {
  const overlays = useMemo(() => {
    if (!coverage) return null;
    return coverage.roads.flatMap((rc) => [
      ...rc.walkedPastSegments.map((seg, j) => (
        <Polyline
          key={`p-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={WALKED_ROAD_STYLE.pastColor}
          strokeWidth={WALKED_ROAD_STYLE.strokeWidth}
        />
      )),
      ...rc.walkedTodaySegments.map((seg, j) => (
        <Polyline
          key={`t-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={WALKED_ROAD_STYLE.todayColor}
          strokeWidth={WALKED_ROAD_STYLE.strokeWidth}
        />
      )),
    ]);
  }, [coverage]);

  return <>{overlays}</>;
}
