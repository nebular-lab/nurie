// OpenStreetMap (Overpass API) から、自宅周辺の歩ける道路を取得する。
// HOME / AREA_RADIUS_M に対応する静的データを lib/osmData.json に同梱しているので、
// 自宅 + 半径が一致するなら即時リターン (ネットワーク不要)。
// 違うときだけ Overpass を叩いて SQLite にキャッシュする。

import { AREA_RADIUS_M, HOME } from './constants';
import { getOsmCache, putOsmCache } from './db';
import staticRoads from './osmData.json';

export type OsmRoad = {
  id: number;
  // [lng, lat] 配列 (turf / GeoJSON 互換)
  coords: [number, number][];
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
): Promise<OsmRoad[]> {
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
  const roads: OsmRoad[] = [];
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
export async function loadOsmRoads(
  homeLat: number,
  homeLng: number,
  radiusM: number,
  options: { forceRefresh?: boolean } = {},
): Promise<OsmRoad[]> {
  if (!options.forceRefresh) {
    const cached = await getOsmCache();
    if (
      cached &&
      Math.abs(cached.homeLat - homeLat) < 1e-6 &&
      Math.abs(cached.homeLng - homeLng) < 1e-6 &&
      cached.radiusM === radiusM
    ) {
      try {
        return JSON.parse(cached.payload) as OsmRoad[];
      } catch (e) {
        console.warn('[osm] cache parse failed, refetching', e);
      }
    }
    if (matchesStatic(homeLat, homeLng, radiusM)) {
      const roads = staticRoads as OsmRoad[];
      // 次回以降のためにキャッシュにも書き込み (高速化)
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
