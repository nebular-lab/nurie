// OpenStreetMap (Overpass API) から、自宅周辺の歩ける道路を取得する。
// HOME / AREA_RADIUS_M に対応する静的データを lib/osmData.json に同梱しているので、
// 自宅 + 半径が一致するなら即時リターン (ネットワーク不要)。
// 違うときだけ Overpass を叩いて SQLite にキャッシュする。

import { lineString } from '@turf/helpers';
import length from '@turf/length';

import { AREA_RADIUS_M, DEAD_END_MAX_LENGTH_M, HOME } from './constants';
import { getOsmCache, putOsmCache } from './db';
import { haversineMeters } from './geo';
import staticRoads from './osmData.json';

type RawOsmRoad = {
  id: number;
  // [lng, lat] 配列 (turf / GeoJSON 互換)
  coords: [number, number][];
};

// totalM はロード時に一度だけ計算してキャッシュする (歩行率は毎秒再計算されるため)。
export type OsmRoad = RawOsmRoad & {
  totalM: number;
};

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// 歩ける道路のフィルタ。高速道路や鉄道などは除外。
const HIGHWAY_FILTER =
  '^(residential|primary|secondary|tertiary|unclassified|footway|path|pedestrian|living_street|service|track|cycleway|steps)$';

type OverpassWay = {
  type: 'way';
  id: number;
  geometry?: { lat: number; lon: number }[];
};

type OverpassResponse = {
  elements: OverpassWay[];
};

function buildQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:25];
way(around:${radiusM},${lat},${lng})["highway"~"${HIGHWAY_FILTER}"];
out geom;`;
}

async function fetchOverpass(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<RawOsmRoad[]> {
  const body = `data=${encodeURIComponent(buildQuery(lat, lng, radiusM))}`;
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Overpass returned ${res.status}`);
  }
  const json = (await res.json()) as OverpassResponse;
  const roads: RawOsmRoad[] = [];
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    roads.push({
      id: el.id,
      coords: el.geometry.map((g) => [g.lon, g.lat] as [number, number]),
    });
  }
  return roads;
}

// 同梱した静的データが「現在の HOME / AREA_RADIUS_M」と一致するか判定。
// 一致するならネットワーク不要。
function matchesStatic(homeLat: number, homeLng: number, radiusM: number): boolean {
  return (
    Math.abs(homeLat - HOME.lat) < 1e-6 &&
    Math.abs(homeLng - HOME.lng) < 1e-6 &&
    radiusM === AREA_RADIUS_M
  );
}

// 自宅と半径が一致するキャッシュがあれば返す。なければ Overpass を叩いて保存。
// 戻す前に短い行き止まり道は除外する (袋小路や私道の枝を除く)。
export async function loadOsmRoads(
  homeLat: number,
  homeLng: number,
  radiusM: number,
  options: { forceRefresh?: boolean } = {},
): Promise<OsmRoad[]> {
  const raw = await loadRawOsmRoads(homeLat, homeLng, radiusM, options);
  return filterShortDeadEnds(raw, homeLat, homeLng, radiusM);
}

async function loadRawOsmRoads(
  homeLat: number,
  homeLng: number,
  radiusM: number,
  options: { forceRefresh?: boolean },
): Promise<RawOsmRoad[]> {
  if (!options.forceRefresh) {
    const cached = await getOsmCache();
    if (
      cached &&
      Math.abs(cached.homeLat - homeLat) < 1e-6 &&
      Math.abs(cached.homeLng - homeLng) < 1e-6 &&
      cached.radiusM === radiusM
    ) {
      try {
        return JSON.parse(cached.payload) as RawOsmRoad[];
      } catch (e) {
        console.warn('[osm] cache parse failed, refetching', e);
      }
    }
    if (matchesStatic(homeLat, homeLng, radiusM)) {
      const roads = staticRoads as RawOsmRoad[];
      putOsmCache({
        homeLat,
        homeLng,
        radiusM,
        fetchedAt: Date.now(),
        payload: JSON.stringify(roads),
      }).catch((e) => console.warn('[osm] cache write failed', e));
      return roads;
    }
  }
  const roads = await fetchOverpass(homeLat, homeLng, radiusM);
  await putOsmCache({
    homeLat,
    homeLng,
    radiusM,
    fetchedAt: Date.now(),
    payload: JSON.stringify(roads),
  });
  return roads;
}

// 全道路を頂点グラフとみなして「短くて、片端が他の道に繋がっていない道」を落とす。
// 円の境界で切られた端点は他の道に繋がっていなくても行き止まり扱いしない
// (本当は外で繋がっているがデータが切られているだけ)。
// 通過する道には totalM を付けて返す (歩行率計算側で再利用するため)。
function filterShortDeadEnds(
  roads: RawOsmRoad[],
  homeLat: number,
  homeLng: number,
  radiusM: number,
): OsmRoad[] {
  const keyOf = (lng: number, lat: number) =>
    `${lng.toFixed(7)},${lat.toFixed(7)}`;

  const coordCount = new Map<string, number>();
  for (const road of roads) {
    for (const [lng, lat] of road.coords) {
      const k = keyOf(lng, lat);
      coordCount.set(k, (coordCount.get(k) ?? 0) + 1);
    }
  }

  const home = { lat: homeLat, lng: homeLng };
  const isInside = (lng: number, lat: number) =>
    haversineMeters(home, { lat, lng }) <= radiusM;

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
    out.push({ ...road, totalM });
  }
  return out;
}
