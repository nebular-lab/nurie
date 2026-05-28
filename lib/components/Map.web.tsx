// Web 版地図。MapLibre GL JS で Stadia タイル + 経路 + fog + 半径バンド円を描画する。

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HOME, RADIUS_BANDS_M } from '../constants';
import {
  buildFogBoundaryEdges,
  buildMapBounds,
  buildOuterMaskPolygon,
  buildFogHexLayers,
} from '../fogHex';
import {
  buildPlaybackPath,
  coordAtDistance,
  kmhToMetersPerMs,
  PLAYBACK_SPEED_KMH,
} from '../playbackPath';
import { smoothCoords } from '../smoothPath';

import type { MapProps } from './Map.native';
import {
  FOG_STYLE,
  PLAYBACK_MARKER_STYLE,
  RADIUS_BAND_STYLE,
  TRACK_PATH_STYLE,
} from './mapOverlayStyle';

const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const STAMEN_TERRAIN_STYLE_URL = `https://tiles.stadiamaps.com/styles/stamen_terrain.json?api_key=${STADIA_API_KEY}`;

// 半径 m を緯度・経度に対応する近似的な円を表す GeoJSON に変換する。
// MapLibre には Circle の primitive が無いので polygon で近似する。
function circleAsPolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  // 緯度 1 度 ≈ 111,320 m。経度は緯度に応じて縮む。
  const latDelta = radiusM / 111320;
  const lngDelta = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([
      center.lng + lngDelta * Math.cos(theta),
      center.lat + latDelta * Math.sin(theta),
    ]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

function radiusLabelFeature(
  center: { lat: number; lng: number },
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [center.lng, center.lat + radiusM / 111320],
    },
    properties: {
      label: `${radiusM / 1000}km`,
    },
  };
}

function multiLineFeatureCollection(
  segments: [number, number][][],
): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const coordinates = segments.filter((seg) => seg.length >= 2);
  if (coordinates.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
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

function trackFeatures(
  tracks: { path: { coordinates: [number, number][] } }[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  return tracks.flatMap((track) => {
    const coords = smoothCoords(track.path.coordinates);
    if (coords.length < 2) return [];
    return [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      },
    ];
  });
}

function playbackFeature(
  coord: [number, number] | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (!coord) return { type: 'FeatureCollection', features: [] };
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

function multiPolygonFeatureCollection(
  polygons: [number, number][][],
): GeoJSON.FeatureCollection<GeoJSON.MultiPolygon> {
  if (polygons.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
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

function setGeoJsonSource(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJSON.GeoJSON,
) {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(sourceId, { type: 'geojson', data });
  }
}

function addGeoJsonSource(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJSON.GeoJSON,
) {
  if (map.getSource(sourceId)) return;
  map.addSource(sourceId, { type: 'geojson', data });
}

function addLayerOnce(map: maplibregl.Map, layer: maplibregl.LayerSpecification) {
  if (map.getLayer(layer.id)) return;
  map.addLayer(layer);
}

function moveLayerToTop(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) map.moveLayer(layerId);
}

export function Map({ initialCoords, trackPoints }: MapProps) {
  // React Native Web では <View> の ref が underlying div を返すが、ここでは MapLibre が
  // HTMLElement を要求するので素の <div> を使う。.web.tsx なので web 専用で OK。
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const animationRef = useRef<number | null>(null);
  const [isFogReady, setIsFogReady] = useState(false);
  const [playbackDistanceM, setPlaybackDistanceM] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const tracks = useMemo(
    () => (trackPoints.status === 'ready' ? trackPoints.tracks : []),
    [trackPoints],
  );
  const playbackPath = useMemo(() => buildPlaybackPath(tracks), [tracks]);
  const playbackData = useMemo(
    () =>
      playbackFeature(
        playbackDistanceM === null
          ? null
          : coordAtDistance(playbackPath, playbackDistanceM),
      ),
    [playbackDistanceM, playbackPath],
  );

  const playPath = useCallback(() => {
    if (playbackPath.totalM <= 0) return;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    setIsPlaying(true);
    setPlaybackDistanceM(0);

    const speedMPerMs = kmhToMetersPerMs(PLAYBACK_SPEED_KMH);
    let startMs: number | null = null;
    const tick = (nowMs: number) => {
      startMs ??= nowMs;
      const distanceM = (nowMs - startMs) * speedMPerMs;
      setPlaybackDistanceM(Math.min(distanceM, playbackPath.totalM));

      if (distanceM < playbackPath.totalM) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        setIsPlaying(false);
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  }, [playbackPath]);

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    },
    [],
  );

  // 初期化はマウント時に 1 回だけ。
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STAMEN_TERRAIN_STYLE_URL,
      center: [initialCoords.longitude, initialCoords.latitude],
      zoom: 14,
      maxBounds: buildMapBounds(),
    });
    mapRef.current = map;

    // 半径バンド (自宅中心の同心円) をスタイル ready 時に追加。
    map.on('load', () => {
      const outerMask = buildOuterMaskPolygon();
      addGeoJsonSource(map, 'fog-outside', {
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
      });
      addLayerOnce(map, {
        id: 'fog-outside',
        type: 'fill',
        source: 'fog-outside',
        paint: {
          'fill-color': FOG_STYLE.outsideFillColor,
          'fill-opacity': 1,
        },
      });

      addGeoJsonSource(
        map,
        'fog-hidden',
        multiPolygonFeatureCollection(
          buildFogHexLayers([]).hiddenHexes.map((hex) => hex.polygon),
        ),
      );
      addLayerOnce(map, {
        id: 'fog-hidden',
        type: 'fill',
        source: 'fog-hidden',
        paint: {
          'fill-color': FOG_STYLE.hiddenFillColor,
          'fill-opacity': 1,
        },
      });

      addGeoJsonSource(map, 'fog-revealed-edge', {
        type: 'FeatureCollection',
        features: [],
      });
      addLayerOnce(map, {
        id: 'fog-revealed-edge-soft',
        type: 'line',
        source: 'fog-revealed-edge',
        paint: {
          'line-color': FOG_STYLE.edgeSoftColor,
          'line-width': FOG_STYLE.edgeSoftWidth,
          'line-blur': 12,
        },
      });
      addLayerOnce(map, {
        id: 'fog-revealed-edge',
        type: 'line',
        source: 'fog-revealed-edge',
        paint: {
          'line-color': FOG_STYLE.edgeColor,
          'line-width': FOG_STYLE.edgeWidth,
          'line-blur': 1,
        },
      });

      const features = RADIUS_BANDS_M.map((r) => circleAsPolygon(HOME, r));
      addGeoJsonSource(map, 'bands', {
        type: 'FeatureCollection',
        features,
      });
      addLayerOnce(map, {
        id: 'bands-outline',
        type: 'line',
        source: 'bands',
        paint: {
          'line-color': RADIUS_BAND_STYLE.strokeColor,
          'line-width': 1,
          'line-dasharray': [3, 3],
        },
      });

      addGeoJsonSource(map, 'band-labels', {
        type: 'FeatureCollection',
        features: RADIUS_BANDS_M.map((r) => radiusLabelFeature(HOME, r)),
      });
      addLayerOnce(map, {
        id: 'band-labels',
        type: 'symbol',
        source: 'band-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 13,
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': RADIUS_BAND_STYLE.strokeColor,
          'text-halo-color': 'rgba(5, 22, 52, 0.95)',
          'text-halo-width': 2,
        },
      });

      addGeoJsonSource(map, 'playback-marker', playbackFeature(null));
      addLayerOnce(map, {
        id: 'playback-marker',
        type: 'circle',
        source: 'playback-marker',
        paint: {
          'circle-color': PLAYBACK_MARKER_STYLE.fillColor,
          'circle-radius': PLAYBACK_MARKER_STYLE.radius,
          'circle-stroke-color': PLAYBACK_MARKER_STYLE.strokeColor,
          'circle-stroke-width': PLAYBACK_MARKER_STYLE.strokeWidth,
        },
      });

      addGeoJsonSource(map, 'tracks', {
        type: 'FeatureCollection',
        features: [],
      });
      addLayerOnce(map, {
        id: 'tracks-casing',
        type: 'line',
        source: 'tracks',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': TRACK_PATH_STYLE.casingColor,
          'line-width': TRACK_PATH_STYLE.casingWidth,
          'line-opacity': 1,
        },
      });
      addLayerOnce(map, {
        id: 'tracks',
        type: 'line',
        source: 'tracks',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': TRACK_PATH_STYLE.strokeColor,
          'line-width': TRACK_PATH_STYLE.strokeWidth,
          'line-opacity': 1,
        },
      });

      moveLayerToTop(map, 'fog-hidden');
      moveLayerToTop(map, 'fog-outside');
      moveLayerToTop(map, 'fog-revealed-edge-soft');
      moveLayerToTop(map, 'fog-revealed-edge');
      moveLayerToTop(map, 'bands-outline');
      moveLayerToTop(map, 'band-labels');
      moveLayerToTop(map, 'playback-marker');
      setIsFogReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [initialCoords.latitude, initialCoords.longitude]);

  // 探索済み hex には何も重ねず、未探索 hex だけ黒くする。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const tracks = trackPoints.status === 'ready' ? trackPoints.tracks : [];
      const { hiddenHexes, revealedHexes } = buildFogHexLayers(tracks);
      const hiddenData = multiPolygonFeatureCollection(
        hiddenHexes.map((hex) => hex.polygon),
      );
      const edgeData = multiLineFeatureCollection(
        buildFogBoundaryEdges(revealedHexes),
      );
      setGeoJsonSource(map, 'fog-hidden', hiddenData);
      setGeoJsonSource(map, 'fog-revealed-edge', edgeData);
      setIsFogReady(true);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [trackPoints]);

  // tracks の更新を滑らかな経路線として反映。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trackPoints.status !== 'ready') return;

    const apply = () => {
      const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features: trackFeatures(trackPoints.tracks),
      };
      setGeoJsonSource(map, 'tracks', data);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [trackPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      setGeoJsonSource(map, 'playback-marker', playbackData);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [playbackData]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {!isFogReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: FOG_STYLE.hiddenFillColor,
          }}
        />
      )}
      <button
        aria-label={isPlaying ? '経路を再生中' : '経路を再生'}
        disabled={playbackPath.totalM <= 0}
        onClick={playPath}
        style={{
          position: 'absolute',
          left: 24,
          bottom: 24,
          width: 48,
          height: 48,
          borderRadius: 24,
          border: '1px solid rgba(96, 210, 255, 0.45)',
          background: 'rgba(7, 20, 44, 0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(96, 210, 255, 0.28)',
          opacity: playbackPath.totalM <= 0 ? 0.45 : 1,
          cursor: playbackPath.totalM <= 0 ? 'default' : 'pointer',
        }}
      >
        <span
          style={
            isPlaying
              ? {
                  width: 15,
                  height: 15,
                  borderRadius: 2,
                  background: '#60D2FF',
                }
              : {
                  width: 0,
                  height: 0,
                  marginLeft: 4,
                  borderTop: '9px solid transparent',
                  borderBottom: '9px solid transparent',
                  borderLeft: '15px solid #60D2FF',
                }
          }
        />
      </button>
    </>
  );
}
