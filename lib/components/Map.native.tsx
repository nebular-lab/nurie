// Native 版は MapLibre Native を使い、Web 版と同じ GeoJSON source / layer の
// 考え方で描画する。react-native-maps の native overlay 順序に依存しない。

import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  NativeUserLocation,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AREA_RADIUS_M,
  HOME,
  RADIUS_BANDS_M,
} from '../constants';
import {
  buildFogBoundaryEdges,
  buildFogHexLayers,
  buildMapBounds,
  buildOuterMaskPolygon,
  clampToMapBounds,
} from '../fogHex';
import type { StoredTrackPointsState } from '../hooks/useStoredTrackPoints';
import { useRecenterMap } from '../hooks/useRecenterMap';
import { useTilesReady } from '../hooks/useTilesReady';
import {
  buildPlaybackPath,
  coordAtDistance,
  kmhToMetersPerMs,
  PLAYBACK_SPEED_KMH,
} from '../playbackPath';
import type { Track } from '../remoteTracks';
import { smoothCoords } from '../smoothPath';

import {
  FOG_STYLE,
  PLAYBACK_MARKER_STYLE,
  RADIUS_BAND_STYLE,
  TRACK_PATH_STYLE,
} from './mapOverlayStyle';
import { RecenterButton } from './RecenterButton';
import { TileLoadingOverlay } from './TileLoadingOverlay';

const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const STAMEN_TERRAIN_STYLE_URL = `https://tiles.stadiamaps.com/styles/stamen_terrain.json?api_key=${STADIA_API_KEY}`;

const CAMERA_PADDING = {
  top: 80,
  right: 28,
  bottom: 120,
  left: 28,
};

const INITIAL_BOUNDS = areaBounds(AREA_RADIUS_M);
const CAMERA_MAX_BOUNDS = toLngLatBounds(buildMapBounds());
const MIN_ZOOM = 11.0;
const MAX_ZOOM = 18;

export type MapProps = {
  initialCoords: { latitude: number; longitude: number };
  trackPoints: StoredTrackPointsState;
};

export function Map({ trackPoints }: MapProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const animationRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [playbackDistanceM, setPlaybackDistanceM] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const tilesReady = useTilesReady(mapReady);

  const centerMapOn = useCallback((latitude: number, longitude: number) => {
    const center = clampToMapBounds({ latitude, longitude });
    cameraRef.current?.easeTo({
      center: [center.longitude, center.latitude],
      zoom: 15,
      duration: 500,
    });
  }, []);
  const recenterMap = useRecenterMap(centerMapOn);

  const tracks = useMemo(
    () => (trackPoints.status === 'ready' ? trackPoints.tracks : []),
    [trackPoints],
  );
  const trackData = useMemo(() => buildTrackFeatureCollection(tracks), [tracks]);
  const fogData = useMemo(() => buildFogFeatureCollections(tracks), [tracks]);
  const radiusData = useMemo(() => buildRadiusFeatureCollection(), []);
  const radiusLabelData = useMemo(() => buildRadiusLabelFeatureCollection(), []);
  const playbackPath = useMemo(() => buildPlaybackPath(tracks), [tracks]);
  const playbackData = useMemo(
    () =>
      buildPlaybackFeatureCollection(
        playbackDistanceM === null
          ? null
          : coordAtDistance(playbackPath, playbackDistanceM),
      ),
    [playbackDistanceM, playbackPath],
  );

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    },
    [],
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

  return (
    <>
      <MapLibreMap
        style={styles.map}
        mapStyle={STAMEN_TERRAIN_STYLE_URL}
        attribution={false}
        compass={false}
        logo={false}
        scaleBar={false}
        touchPitch={false}
        touchRotate={false}
        onDidFinishLoadingStyle={() => setMapReady(true)}
        onDidFinishRenderingMapFully={() => setMapReady(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: INITIAL_BOUNDS,
            padding: CAMERA_PADDING,
          }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={CAMERA_MAX_BOUNDS}
        />

        <LayeredGeoJson id="tracks" data={trackData}>
          <Layer
            id="tracks-casing"
            type="line"
            source="tracks"
            layout={ROUND_LINE_LAYOUT}
            paint={{
              'line-color': TRACK_PATH_STYLE.casingColor,
              'line-width': TRACK_PATH_STYLE.casingWidth,
              'line-opacity': 1,
            }}
          />
          <Layer
            id="tracks"
            type="line"
            source="tracks"
            layout={ROUND_LINE_LAYOUT}
            paint={{
              'line-color': TRACK_PATH_STYLE.strokeColor,
              'line-width': TRACK_PATH_STYLE.strokeWidth,
              'line-opacity': 1,
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="fog-hidden" data={fogData.hidden}>
          <Layer
            id="fog-hidden"
            type="fill"
            source="fog-hidden"
            paint={{
              'fill-color': FOG_STYLE.hiddenFillColor,
              'fill-opacity': 1,
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="fog-outside" data={fogData.outside}>
          <Layer
            id="fog-outside"
            type="fill"
            source="fog-outside"
            paint={{
              'fill-color': FOG_STYLE.outsideFillColor,
              'fill-opacity': 1,
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="fog-revealed-edge" data={fogData.edge}>
          <Layer
            id="fog-revealed-edge-soft"
            type="line"
            source="fog-revealed-edge"
            paint={{
              'line-color': FOG_STYLE.edgeSoftColor,
              'line-width': FOG_STYLE.edgeSoftWidth,
              'line-blur': 12,
            }}
          />
          <Layer
            id="fog-revealed-edge"
            type="line"
            source="fog-revealed-edge"
            paint={{
              'line-color': FOG_STYLE.edgeColor,
              'line-width': FOG_STYLE.edgeWidth,
              'line-blur': 1,
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="radius-bands" data={radiusData}>
          <Layer
            id="radius-bands"
            type="line"
            source="radius-bands"
            paint={{
              'line-color': RADIUS_BAND_STYLE.strokeColor,
              'line-width': 1.5,
              'line-dasharray': [3, 3],
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="radius-band-labels" data={radiusLabelData}>
          <Layer
            id="radius-band-labels"
            type="symbol"
            source="radius-band-labels"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 13,
              'text-anchor': 'bottom',
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{
              'text-color': RADIUS_BAND_STYLE.strokeColor,
              'text-halo-color': 'rgba(5, 22, 52, 0.95)',
              'text-halo-width': 2,
            }}
          />
        </LayeredGeoJson>

        <LayeredGeoJson id="playback-marker" data={playbackData}>
          <Layer
            id="playback-marker"
            type="circle"
            source="playback-marker"
            paint={{
              'circle-color': PLAYBACK_MARKER_STYLE.fillColor,
              'circle-radius': PLAYBACK_MARKER_STYLE.radius,
              'circle-stroke-color': PLAYBACK_MARKER_STYLE.strokeColor,
              'circle-stroke-width': PLAYBACK_MARKER_STYLE.strokeWidth,
            }}
          />
        </LayeredGeoJson>

        <NativeUserLocation mode="default" />
      </MapLibreMap>

      <PlaybackButton
        bottom={insets.bottom + 24}
        disabled={playbackPath.totalM <= 0}
        isPlaying={isPlaying}
        onPress={playPath}
      />
      <RecenterButton bottom={insets.bottom + 24} onPress={recenterMap} />
      <TileLoadingOverlay visible={!tilesReady || trackPoints.status === 'loading'} />
    </>
  );
}

function LayeredGeoJson({
  id,
  data,
  children,
}: {
  id: string;
  data: GeoJSON.FeatureCollection;
  children: ReactNode;
}) {
  return (
    <GeoJSONSource id={id} data={data}>
      {children}
    </GeoJSONSource>
  );
}

const ROUND_LINE_LAYOUT = {
  'line-cap': 'round',
  'line-join': 'round',
} as const;

function buildTrackFeatureCollection(
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

function buildFogFeatureCollections(tracks: Track[]): {
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

function buildRadiusFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return polygonFeatureCollection(
    RADIUS_BANDS_M.map((radius) => circleAsPolygon(HOME, radius)),
  );
}

function buildRadiusLabelFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Point> {
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

function buildPlaybackFeatureCollection(
  coord: [number, number] | null,
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

function multiLineFeatureCollection(
  lines: [number, number][][],
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
  polygons: [number, number][][],
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

function multiPolygonFeatureCollection(
  polygons: [number, number][][],
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
): [number, number][] {
  const coords: [number, number][] = [];
  const steps = 160;
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
): [number, number] {
  return [center.lng, center.lat + radiusM / 111320];
}

function areaBounds(radiusM: number): LngLatBounds {
  const latDelta = radiusM / 111320;
  const lngDelta = radiusM / (111320 * Math.cos((HOME.lat * Math.PI) / 180));
  return [
    HOME.lng - lngDelta,
    HOME.lat - latDelta,
    HOME.lng + lngDelta,
    HOME.lat + latDelta,
  ];
}

function toLngLatBounds(
  bounds: [[number, number], [number, number]],
): LngLatBounds {
  const [southwest, northeast] = bounds;
  return [southwest[0], southwest[1], northeast[0], northeast[1]];
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  playbackButton: {
    position: 'absolute',
    left: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(7, 20, 44, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(96, 210, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60D2FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  playbackButtonDisabled: {
    opacity: 0.45,
  },
  playbackPlayIcon: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#60D2FF',
  },
  playbackStopIcon: {
    width: 15,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#60D2FF',
  },
});

function PlaybackButton({
  bottom,
  disabled,
  isPlaying,
  onPress,
}: {
  bottom: number;
  disabled: boolean;
  isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={isPlaying ? '経路を再生中' : '経路を再生'}
      style={[
        styles.playbackButton,
        { bottom },
        disabled && styles.playbackButtonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      {isPlaying ? <View style={styles.playbackStopIcon} /> : <View style={styles.playbackPlayIcon} />}
    </Pressable>
  );
}
