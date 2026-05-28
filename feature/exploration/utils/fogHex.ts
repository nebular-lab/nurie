import { AREA_RADIUS_M, FOG_HEX_RADIUS_M, HOME } from '@/shared/constants/appConfig';
import type { Track } from '@/feature/tracking/types';

type Coord = [number, number];

export type FogHex = {
  id: string;
  center: { lat: number; lng: number };
  polygon: Coord[];
};

export type FogHexLayers = {
  hiddenHexes: FogHex[];
  revealedHexes: FogHex[];
};

export type FogEdgeSegment = [Coord, Coord];

export type FogCoverageBand = {
  totalTiles: number;
  revealedTiles: number;
};

export type FogMask = {
  outer: Coord[];
  holes: Coord[][];
  revealedHexes: FogHex[];
};

export type FogViewport = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

type Axial = {
  q: number;
  r: number;
};

const SQRT3 = Math.sqrt(3);
const HOME_SCALE = {
  latMeters: 111320,
  lngMeters: 111320 * Math.cos((HOME.lat * Math.PI) / 180),
};
const ALL_FOG_HEXES = createAllFogHexes();
const FOG_HEXES_BY_ID = new Map(ALL_FOG_HEXES.map((hex) => [hex.id, hex]));

export function buildOuterMaskPolygon(): { outer: Coord[]; hole: Coord[] } {
  const radiusM = AREA_RADIUS_M;
  const padM = AREA_RADIUS_M * 4;
  const outer: Coord[] = [
    xyMetersToLngLat({ x: -padM, y: -padM }),
    xyMetersToLngLat({ x: padM, y: -padM }),
    xyMetersToLngLat({ x: padM, y: padM }),
    xyMetersToLngLat({ x: -padM, y: padM }),
    xyMetersToLngLat({ x: -padM, y: -padM }),
  ];
  const hole: Coord[] = [];
  const steps = 128;
  for (let i = steps; i >= 0; i--) {
    const theta = (i / steps) * 2 * Math.PI;
    hole.push(
      xyMetersToLngLat({
        x: Math.cos(theta) * radiusM,
        y: Math.sin(theta) * radiusM,
      }),
    );
  }
  return { outer, hole };
}

export function buildFogMask(tracks: Track[]): FogMask {
  const { revealedHexes } = buildFogHexLayers(tracks);
  return {
    outer: buildFogBoundaryPolygon(),
    // Polygon holes は外周と逆向きにしておく。MapLibre / native map の
    // triangulation 実装によっては winding が同じだと穴として扱われない。
    holes: revealedHexes.map((hex) => [...hex.polygon].reverse()),
    revealedHexes,
  };
}

export function buildMapBounds(): [[number, number], [number, number]] {
  // MapLibre の maxBounds は「表示中の viewport 全体」を bounds 内に収める。
  // 縦長画面で 5km 円の全体を見せるには、円の外接正方形よりかなり大きい
  // bounds が必要なので、スクロール制限用には表示マスクより広い範囲を使う。
  const radiusM = AREA_RADIUS_M * 2;
  const southwest = xyMetersToLngLat({ x: -radiusM, y: -radiusM });
  const northeast = xyMetersToLngLat({ x: radiusM, y: radiusM });
  return [southwest, northeast];
}

export function clampToMapBounds(point: { latitude: number; longitude: number }): {
  latitude: number;
  longitude: number;
} {
  const [southwest, northeast] = buildMapBounds();
  return {
    latitude: Math.min(Math.max(point.latitude, southwest[1]), northeast[1]),
    longitude: Math.min(Math.max(point.longitude, southwest[0]), northeast[0]),
  };
}

export function buildFogHexLayers(
  tracks: Track[],
  viewport?: FogViewport,
): FogHexLayers {
  const revealedIds = buildRevealedHexIds(tracks);
  const hiddenHexes: FogHex[] = [];
  const revealedHexes: FogHex[] = [];

  for (const hex of ALL_FOG_HEXES) {
    if (viewport && !hexIntersectsViewport(hex, viewport)) continue;
    if (revealedIds.has(hex.id)) {
      revealedHexes.push(hex);
    } else {
      hiddenHexes.push(hex);
    }
  }

  return { hiddenHexes, revealedHexes };
}

export function buildFogBoundaryEdges(hexes: FogHex[]): FogEdgeSegment[] {
  const edges = new Map<
    string,
    { count: number; segment: FogEdgeSegment }
  >();

  for (const hex of hexes) {
    for (let i = 0; i < hex.polygon.length - 1; i++) {
      const segment: FogEdgeSegment = [hex.polygon[i], hex.polygon[i + 1]];
      const key = normalizedEdgeKey(segment);
      const current = edges.get(key);
      if (current) {
        current.count += 1;
      } else {
        edges.set(key, { count: 1, segment });
      }
    }
  }

  return [...edges.values()]
    .filter((edge) => edge.count === 1)
    .map((edge) => edge.segment);
}

export function aggregateFogCoverageByBands(
  tracks: Track[],
  bandsM: readonly number[],
): FogCoverageBand[] {
  const revealedIds = buildRevealedHexIds(tracks);
  const revealedCounts = new Array<number>(bandsM.length).fill(0);
  const totalCounts = new Array<number>(bandsM.length).fill(0);

  for (const hex of ALL_FOG_HEXES) {
    for (let i = 0; i < bandsM.length; i++) {
      const radiusM = bandsM[i];
      if (distanceFromHomeM(hex.center) <= radiusM) {
        totalCounts[i] += 1;
        if (revealedIds.has(hex.id)) {
          revealedCounts[i] += 1;
        }
      }
    }
  }

  return bandsM.map((_, i) => ({
    totalTiles: totalCounts[i],
    revealedTiles: revealedCounts[i],
  }));
}

export function regionToFogViewport(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): FogViewport {
  const latMargin = region.latitudeDelta * 0.35;
  const lngMargin = region.longitudeDelta * 0.35;
  return {
    minLat: region.latitude - region.latitudeDelta / 2 - latMargin,
    maxLat: region.latitude + region.latitudeDelta / 2 + latMargin,
    minLng: region.longitude - region.longitudeDelta / 2 - lngMargin,
    maxLng: region.longitude + region.longitudeDelta / 2 + lngMargin,
  };
}

function hexIntersectsViewport(hex: FogHex, viewport: FogViewport): boolean {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of hex.polygon) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return !(
    maxLat < viewport.minLat ||
    viewport.maxLat < minLat ||
    maxLng < viewport.minLng ||
    viewport.maxLng < minLng
  );
}

function normalizedEdgeKey([a, b]: FogEdgeSegment): string {
  const aKey = coordKey(a);
  const bKey = coordKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function coordKey([lng, lat]: Coord): string {
  return `${lng.toFixed(7)},${lat.toFixed(7)}`;
}

function buildFogBoundaryPolygon(): Coord[] {
  const coords: Coord[] = [];
  const steps = 128;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push(
      xyMetersToLngLat({
        x: Math.cos(theta) * AREA_RADIUS_M,
        y: Math.sin(theta) * AREA_RADIUS_M,
      }),
    );
  }
  return coords;
}

function buildRevealedHexIds(tracks: Track[]): Set<string> {
  const ids = new Set<string>();
  for (const track of tracks) {
    for (const coord of track.path.coordinates) {
      const axial = lngLatToAxial(coord);
      const id = axialId(axial);
      if (FOG_HEXES_BY_ID.has(id)) ids.add(id);
    }
  }
  return ids;
}

function createAllFogHexes(): FogHex[] {
  const hexes: FogHex[] = [];
  const limit = Math.ceil((AREA_RADIUS_M + FOG_HEX_RADIUS_M * 3) / FOG_HEX_RADIUS_M);
  for (let q = -limit; q <= limit; q++) {
    for (let r = -limit; r <= limit; r++) {
      const hex = axialToFogHex({ q, r });
      if (distanceFromHomeM(hex.center) <= AREA_RADIUS_M + FOG_HEX_RADIUS_M) {
        hexes.push(hex);
      }
    }
  }
  return hexes;
}

function axialId({ q, r }: Axial): string {
  return `${q}:${r}`;
}

function lngLatToAxial([lng, lat]: Coord): Axial {
  const { x, y } = lngLatToXYMeters({ lng, lat });
  const qFloat = ((SQRT3 / 3) * x - (1 / 3) * y) / FOG_HEX_RADIUS_M;
  const rFloat = ((2 / 3) * y) / FOG_HEX_RADIUS_M;
  return roundAxial(qFloat, rFloat);
}

function axialToFogHex({ q, r }: Axial): FogHex {
  const x = FOG_HEX_RADIUS_M * SQRT3 * (q + r / 2);
  const y = FOG_HEX_RADIUS_M * 1.5 * r;
  const center = xyMetersToLngLat({ x, y });
  const polygon: Coord[] = [];
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    polygon.push(
      xyMetersToLngLat({
        x: x + FOG_HEX_RADIUS_M * Math.cos(angle),
        y: y + FOG_HEX_RADIUS_M * Math.sin(angle),
      }),
    );
  }
  return {
    id: axialId({ q, r }),
    center: { lat: center[1], lng: center[0] },
    polygon,
  };
}

function roundAxial(qFloat: number, rFloat: number): Axial {
  const x = qFloat;
  const z = rFloat;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

function lngLatToXYMeters({ lng, lat }: { lng: number; lat: number }): {
  x: number;
  y: number;
} {
  return {
    x: (lng - HOME.lng) * HOME_SCALE.lngMeters,
    y: (lat - HOME.lat) * HOME_SCALE.latMeters,
  };
}

function xyMetersToLngLat({ x, y }: { x: number; y: number }): Coord {
  return [HOME.lng + x / HOME_SCALE.lngMeters, HOME.lat + y / HOME_SCALE.latMeters];
}

function distanceFromHomeM(point: { lat: number; lng: number }): number {
  const { x, y } = lngLatToXYMeters(point);
  return Math.hypot(x, y);
}
