import { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import type { CoverageResult } from '../coverage';

// 道路の色: 過去歩行=薄い赤、今日歩行=緑 (未踏は描かない)
const PAST_WALKED_COLOR = '#FF9999';
const TODAY_WALKED_COLOR = '#34C759';
const STROKE_WIDTH = 5;

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
          strokeColor={PAST_WALKED_COLOR}
          strokeWidth={STROKE_WIDTH}
        />
      )),
      ...rc.walkedTodaySegments.map((seg, j) => (
        <Polyline
          key={`t-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={TODAY_WALKED_COLOR}
          strokeWidth={STROKE_WIDTH}
        />
      )),
    ]);
  }, [coverage]);

  return <>{overlays}</>;
}
