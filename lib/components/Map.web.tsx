// Web 版地図。MapLibre GL JS で Stadia タイル + 歩いた道 + 黄ドット + 半径バンド円を描画する。
// 閲覧専用なので操作系 (recenter ボタン等) は持たない。

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

import { HOME, RADIUS_BANDS_M } from '../constants';

import type { MapProps } from './Map.native';
import {
  RADIUS_BAND_STYLE,
  RAW_POINT_STYLE,
  WALKED_ROAD_STYLE,
} from './mapOverlayStyle';

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

function lineFeatures(
  segments: [number, number][][],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  return segments
    .filter((seg) => seg.length >= 2)
    .map((seg) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: seg },
      properties: {},
    }));
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

export function Map({ initialCoords, coverage, trackPoints }: MapProps) {
  // React Native Web では <View> の ref が underlying div を返すが、ここでは MapLibre が
  // HTMLElement を要求するので素の <div> を使う。.web.tsx なので web 専用で OK。
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // 初期化はマウント時に 1 回だけ。
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [initialCoords.longitude, initialCoords.latitude],
      zoom: 14,
    });
    mapRef.current = map;

    // 半径バンド (自宅中心の同心円) をスタイル ready 時に追加。
    map.on('load', () => {
      const features = RADIUS_BANDS_M.map((r) => circleAsPolygon(HOME, r));
      map.addSource('bands', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      map.addLayer({
        id: 'bands-outline',
        type: 'line',
        source: 'bands',
        paint: {
          'line-color': RADIUS_BAND_STYLE.strokeColor,
          'line-width': 1,
          'line-dasharray': [3, 3],
        },
      });

      map.addSource('roads-past', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'roads-past',
        type: 'line',
        source: 'roads-past',
        paint: {
          'line-color': WALKED_ROAD_STYLE.pastColor,
          'line-width': WALKED_ROAD_STYLE.strokeWidth,
          'line-opacity': 1,
        },
      });

      map.addSource('roads-today', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'roads-today',
        type: 'line',
        source: 'roads-today',
        paint: {
          'line-color': WALKED_ROAD_STYLE.todayColor,
          'line-width': WALKED_ROAD_STYLE.strokeWidth,
          'line-opacity': 1,
        },
      });

      map.addSource('points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'points-fill',
        type: 'fill',
        source: 'points',
        paint: {
          'fill-color': RAW_POINT_STYLE.fillColor,
          'fill-opacity': 1,
        },
      });
      map.addLayer({
        id: 'points-outline',
        type: 'line',
        source: 'points',
        paint: {
          'line-color': RAW_POINT_STYLE.strokeColor,
          'line-width': 1,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [initialCoords.latitude, initialCoords.longitude]);

  // coverage の更新を赤/緑の道路に反映。Native と同じく過去 → 今日の順で重ねる。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!coverage) return;

    const apply = () => {
      const pastFeatures = coverage.roads.flatMap((rc) =>
        lineFeatures(rc.walkedPastSegments),
      );
      const todayFeatures = coverage.roads.flatMap((rc) =>
        lineFeatures(rc.walkedTodaySegments),
      );

      setGeoJsonSource(map, 'roads-past', {
        type: 'FeatureCollection',
        features: pastFeatures,
      });
      setGeoJsonSource(map, 'roads-today', {
        type: 'FeatureCollection',
        features: todayFeatures,
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [coverage]);

  // trackPoints の更新を反映。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trackPoints.status !== 'ready') return;

    const apply = () => {
      const features = trackPoints.points.map((p) =>
        circleAsPolygon({ lat: p.lat, lng: p.lng }, RAW_POINT_STYLE.radiusM, 24),
      );
      const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
        type: 'FeatureCollection',
        features,
      };
      setGeoJsonSource(map, 'points', data);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [trackPoints]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
