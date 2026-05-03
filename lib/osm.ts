// 自宅周辺の歩ける道路データを提供する。
// 静的データ (lib/osmData.json) は scripts/fetch-gsi-roads.mjs が GSI ベクトルタイルから
// 生成したもの。HOME / AREA_RADIUS_M を変えたら再生成すること。

import { lineString } from '@turf/helpers';
import length from '@turf/length';

import { AREA_RADIUS_M, DEAD_END_MAX_LENGTH_M, HOME } from './constants';
import { haversineMeters } from './geo';
import staticRoads from './osmData.json';

type RawOsmRoad = {
  id: number;
  highway: string;
  // [lng, lat] 配列 (turf / GeoJSON 互換)
  coords: [number, number][];
};

// [minLng, minLat, maxLng, maxLat]
export type Bbox = [number, number, number, number];

// totalM と bbox はロード時に一度だけ計算してキャッシュする
// (歩行率は毎秒再計算されるため、毎回の計算は避けたい)。
export type OsmRoad = RawOsmRoad & {
  totalM: number;
  bbox: Bbox;
};

export async function loadOsmRoads(): Promise<OsmRoad[]> {
  const raw = staticRoads as RawOsmRoad[];
  const filtered = filterShortDeadEnds(raw);
  const counts: Record<string, number> = {};
  for (const r of filtered) {
    counts[r.highway] = (counts[r.highway] ?? 0) + 1;
  }
  console.log(
    `[roads] loaded ${filtered.length} after dead-end filter, breakdown:`,
    counts,
  );
  return filtered;
}

// 全道路を頂点グラフとみなして「短くて、片端が他の道に繋がっていない道」を落とす。
// 円の境界で切られた端点は他の道に繋がっていなくても行き止まり扱いしない
// (本当は外で繋がっているがデータが切られているだけ)。
// 通過する道には totalM と bbox を付けて返す (歩行率計算側で再利用するため)。
function filterShortDeadEnds(roads: RawOsmRoad[]): OsmRoad[] {
  const keyOf = (lng: number, lat: number) =>
    `${lng.toFixed(7)},${lat.toFixed(7)}`;

  const coordCount = new Map<string, number>();
  for (const road of roads) {
    for (const [lng, lat] of road.coords) {
      const k = keyOf(lng, lat);
      coordCount.set(k, (coordCount.get(k) ?? 0) + 1);
    }
  }

  const home = { lat: HOME.lat, lng: HOME.lng };
  const isInside = (lng: number, lat: number) =>
    haversineMeters(home, { lat, lng }) <= AREA_RADIUS_M;

  const isDeadEndCoord = (c: [number, number]) => {
    if (!isInside(c[0], c[1])) return false;
    return (coordCount.get(keyOf(c[0], c[1])) ?? 0) <= 1;
  };

  const out: OsmRoad[] = [];
  for (const road of roads) {
    if (road.coords.length < 2) continue;
    const totalM =
      length(lineString(road.coords), { units: 'kilometers' }) * 1000;

    if (totalM <= DEAD_END_MAX_LENGTH_M) {
      const first = road.coords[0];
      const last = road.coords[road.coords.length - 1];
      if (isDeadEndCoord(first) || isDeadEndCoord(last)) continue;
    }

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of road.coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    out.push({
      ...road,
      totalM,
      bbox: [minLng, minLat, maxLng, maxLat],
    });
  }
  return out;
}
