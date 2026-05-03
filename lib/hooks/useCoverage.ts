// 歩行点列 + OSM 道路 + バッファから歩行率を計算する。
// 計算は重いので useMemo でキャッシュし、依存値が変わったときだけ再計算する。
// 上流のデータがまだ揃っていない場合 (points または roads が null) は計算しないで null を返す。

import { useMemo } from 'react';

import { computeCoverage, type CoverageResult } from '../coverage';
import type { Point } from '../db';
import type { OsmRoad } from '../osm';

export function useCoverage(
  points: Point[] | null,
  roads: OsmRoad[] | null,
  bufferM: number,
): CoverageResult | null {
  return useMemo(() => {
    if (!points) return null;
    if (!roads || roads.length === 0) return null;
    return computeCoverage(points, roads, bufferM);
  }, [points, roads, bufferM]);
}
