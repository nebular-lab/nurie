import type { Track } from '@/feature/tracking/types';
import { HOME, RADIUS_BANDS_M } from '@/shared/constants/appConfig';

import {
  buildFogBoundaryEdges,
  buildFogHexLayers,
  buildOuterMaskPolygon,
} from './fogHex';
import { smoothCoords } from './smoothPath';

type Coord = [number, number];

export function buildTrackFeatureCollection(
  tracks: Track[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: tracks.flatMap((track) => {
      const coords = smoothCoords(track.path.coordinates);
      if (coords.length < 2) return [];
      return [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        },
      ];
    }),
  };
}

export function buildFogFeatureCollections(tracks: Track[]): {
  hidden: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>;
  outside: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  edge: GeoJSON.FeatureCollection<GeoJSON.MultiLineString>;
} {
  const outerMask = buildOuterMaskPolygon();
  const { hiddenHexes, revealedHexes } = buildFogHexLayers(tracks);

  return {
    hidden: multiPolygonFeatureCollection(hiddenHexes.map((hex) => hex.polygon)),
    outside: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [outerMask.outer, outerMask.hole],
          },
          properties: {},
        },
      ],
    },
    edge: multiLineFeatureCollection(buildFogBoundaryEdges(revealedHexes)),
  };
}

export function buildRadiusFeatureCollection(
  steps = 64,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return polygonFeatureCollection(
    RADIUS_BANDS_M.map((radius) => circleAsPolygon(HOME, radius, steps)),
  );
}

export function buildRadiusLabelFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: RADIUS_BANDS_M.map((radius) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: radiusLabelCoord(HOME, radius),
      },
      properties: {
        label: `${radius / 1000}km`,
      },
    })),
  };
}

export function buildPlaybackFeatureCollection(
  coord: Coord | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (!coord) return emptyFeatureCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {},
      },
    ],
  };
}

export function buildInitialHiddenFogFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.MultiPolygon> {
  return multiPolygonFeatureCollection(
    buildFogHexLayers([]).hiddenHexes.map((hex) => hex.polygon),
  );
}

export function multiLineFeatureCollection(
  lines: Coord[][],
): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const coordinates = lines.filter((line) => line.length >= 2);
  if (coordinates.length === 0) return emptyFeatureCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates },
        properties: {},
      },
    ],
  };
}

function polygonFeatureCollection(
  polygons: Coord[][],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: polygons.map((polygon) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [polygon] },
      properties: {},
    })),
  };
}

export function multiPolygonFeatureCollection(
  polygons: Coord[][],
): GeoJSON.FeatureCollection<GeoJSON.MultiPolygon> {
  if (polygons.length === 0) return emptyFeatureCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: polygons.map((polygon) => [polygon]),
        },
        properties: {},
      },
    ],
  };
}

function emptyFeatureCollection<T extends GeoJSON.Geometry>(): GeoJSON.FeatureCollection<T> {
  return { type: 'FeatureCollection', features: [] };
}

function circleAsPolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps: number,
): Coord[] {
  const coords: Coord[] = [];
  const latDelta = radiusM / 111320;
  const lngDelta = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([
      center.lng + lngDelta * Math.cos(theta),
      center.lat + latDelta * Math.sin(theta),
    ]);
  }

  return coords;
}

function radiusLabelCoord(
  center: { lat: number; lng: number },
  radiusM: number,
): Coord {
  return [center.lng, center.lat + radiusM / 111320];
}
