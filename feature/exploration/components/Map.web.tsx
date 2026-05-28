// Web 版地図。MapLibre GL JS で Stadia タイル + 経路 + fog + 半径バンド円を描画する。

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildMapBounds,
} from '../utils/fogHex';
import {
  buildFogFeatureCollections,
  buildInitialHiddenFogFeatureCollection,
  buildPlaybackFeatureCollection,
  buildRadiusFeatureCollection,
  buildRadiusLabelFeatureCollection,
  buildTrackFeatureCollection,
} from '../utils/geoJson';
import { usePlayback } from '../hooks/usePlayback';

import type { MapProps } from './Map.native';
import {
  FOG_STYLE,
  PLAYBACK_MARKER_STYLE,
  RADIUS_BAND_STYLE,
  TRACK_PATH_STYLE,
} from '../utils/mapOverlayStyle';
import { PlaybackButton } from './PlaybackButton.web';

const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const STAMEN_TERRAIN_STYLE_URL = `https://tiles.stadiamaps.com/styles/stamen_terrain.json?api_key=${STADIA_API_KEY}`;

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
  const [isFogReady, setIsFogReady] = useState(false);
  const tracks = useMemo(
    () => (trackPoints.status === 'ready' ? trackPoints.tracks : []),
    [trackPoints],
  );
  const playback = usePlayback(tracks);
  const playbackData = useMemo(
    () => buildPlaybackFeatureCollection(playback.playbackCoord),
    [playback.playbackCoord],
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
      const emptyFog = buildFogFeatureCollections([]);
      addGeoJsonSource(map, 'fog-outside', emptyFog.outside);
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
        buildInitialHiddenFogFeatureCollection(),
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

      addGeoJsonSource(map, 'bands', buildRadiusFeatureCollection());
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

      addGeoJsonSource(map, 'band-labels', buildRadiusLabelFeatureCollection());
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

      addGeoJsonSource(map, 'playback-marker', buildPlaybackFeatureCollection(null));
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
      const fog = buildFogFeatureCollections(tracks);
      setGeoJsonSource(map, 'fog-hidden', fog.hidden);
      setGeoJsonSource(map, 'fog-revealed-edge', fog.edge);
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
      setGeoJsonSource(map, 'tracks', buildTrackFeatureCollection(trackPoints.tracks));
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
      <PlaybackButton
        bottom={24}
        disabled={playback.disabled}
        isPlaying={playback.isPlaying}
        onPress={playback.playPath}
      />
    </>
  );
}
