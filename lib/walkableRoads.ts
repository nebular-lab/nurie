// 自宅周辺の歩ける道路 (primary / unclassified) データを提供する。
// 自動車専用道や庭園路などは scripts/fetch-gsi-roads.mjs の段階で除外済み。
// 静的データ (lib/walkableRoadsData.json) は同スクリプトが GSI ベクトルタイルから生成。
// HOME / AREA_RADIUS_M を変えたら再生成すること。

import { lineString } from '@turf/helpers';
import { length } from '@turf/length';

import { AREA_RADIUS_M, DEAD_END_MAX_LENGTH_M, HOME } from './constants';
import { haversineMeters } from './geo';
import staticRoads from './walkableRoadsData.json';

type Coord = [number, number];

type RawWalkableRoad = {
  id: number;
  highway: string;
  // [lng, lat] 配列 (turf / GeoJSON 互換)
  coords: Coord[];
};

// [minLng, minLat, maxLng, maxLat]
export type Bbox = [number, number, number, number];

// totalM, bbox, minDistFromHome はロード時に一度だけ計算してキャッシュする
// (歩行率は毎秒再計算されるため、毎回の計算は避けたい)。
export type WalkableRoad = RawWalkableRoad & {
  totalM: number;
  bbox: Bbox;
  // 自宅からの最短距離 (m)。1km / 3km / 5km の半径別歩行率の振り分けに使う。
  minDistFromHome: number;
};

type RoadMetrics = {
  totalM: number;
  bbox: Bbox;
  minDistFromHome: number;
};

export async function loadWalkableRoads(): Promise<WalkableRoad[]> {
  const raw = staticRoads as RawWalkableRoad[];
  const prepared = prepareRoads(raw);
  logRoadBreakdown(prepared);
  return prepared;
}

// 短くて片端が他の道に繋がっていない道 (袋小路・私道枝) を落としつつ、
// 残った道には totalM, bbox, minDistFromHome を付けて返す。
function prepareRoads(roads: RawWalkableRoad[]): WalkableRoad[] {
  const coordCount = buildCoordCount(roads);

  const out: WalkableRoad[] = [];
  for (const road of roads) {
    if (road.coords.length < 2) continue;
    const metrics = computeRoadMetrics(road);
    if (
      metrics.totalM <= DEAD_END_MAX_LENGTH_M &&
      hasDeadEndEndpoint(road, coordCount)
    ) {
      continue;
    }
    out.push({ ...road, ...metrics });
  }
  return out;
}

// 1e-7 の精度で頂点を一意化し、その頂点が何本の道に共有されているかを数える。
function buildCoordCount(roads: RawWalkableRoad[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const road of roads) {
    for (const coord of road.coords) {
      const key = coordKey(coord);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function coordKey([lng, lat]: Coord): string {
  return `${lng.toFixed(7)},${lat.toFixed(7)}`;
}

// 円の境界で切られた端点は他の道に繋がっていなくても行き止まり扱いしない
// (本当は外で繋がっているがデータが切られているだけ)。
function hasDeadEndEndpoint(
  road: RawWalkableRoad,
  coordCount: Map<string, number>,
): boolean {
  const first = road.coords[0];
  const last = road.coords[road.coords.length - 1];
  return isDeadEndCoord(first, coordCount) || isDeadEndCoord(last, coordCount);
}

function isDeadEndCoord(coord: Coord, coordCount: Map<string, number>): boolean {
  const [lng, lat] = coord;
  const distFromHome = haversineMeters(HOME, { lat, lng });
  if (distFromHome > AREA_RADIUS_M) return false;
  return (coordCount.get(coordKey(coord)) ?? 0) <= 1;
}

function computeRoadMetrics(road: RawWalkableRoad): RoadMetrics {
  const totalM = length(lineString(road.coords), { units: 'kilometers' }) * 1000;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minDistFromHome = Infinity;
  for (const [lng, lat] of road.coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    const d = haversineMeters(HOME, { lat, lng });
    if (d < minDistFromHome) minDistFromHome = d;
  }

  return {
    totalM,
    bbox: [minLng, minLat, maxLng, maxLat],
    minDistFromHome,
  };
}

function logRoadBreakdown(roads: WalkableRoad[]): void {
  const counts: Record<string, number> = {};
  for (const r of roads) {
    counts[r.highway] = (counts[r.highway] ?? 0) + 1;
  }
  console.log(
    `[roads] loaded ${roads.length} after dead-end filter, breakdown:`,
    counts,
  );
}
