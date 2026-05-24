// 自宅周辺の歩ける道路 (primary / unclassified) データを提供する。
// 自動車専用道や庭園路などは scripts/fetch-gsi-roads.mjs の段階で除外済み。
// 静的データ (lib/walkableRoadsData.json) は同スクリプトが GSI ベクトルタイルから生成。
// HOME / AREA_RADIUS_M を変えたら再生成すること。

import { lineString } from '@turf/helpers';
import { length } from '@turf/length';

import { HOME } from './constants';
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
  return prepared;
}

// 各道路に totalM, bbox, minDistFromHome を付けて返す。
function prepareRoads(roads: RawWalkableRoad[]): WalkableRoad[] {
  const out: WalkableRoad[] = [];
  for (const road of roads) {
    if (road.coords.length < 2) continue;
    const metrics = computeRoadMetrics(road);
    out.push({ ...road, ...metrics });
  }
  return out;
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
