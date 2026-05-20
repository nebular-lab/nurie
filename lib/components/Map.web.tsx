// Web 版地図。MapLibre GL JS で Stadia タイル + 黄ドット + 半径バンド円を描画する。
// 閲覧専用なので操作系 (recenter ボタン等) は持たない。

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

import { HOME, RADIUS_BANDS_M } from '../constants';

import type { MapProps } from './Map.native';

const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;

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

export function Map({ initialCoords, trackPoints }: MapProps) {
  // React Native Web では <View> の ref が underlying div を返すが、ここでは MapLibre が
  // HTMLElement を要求するので素の <div> を使う。.web.tsx なので web 専用で OK。
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // 初期化はマウント時に 1 回だけ。
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const tileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${STADIA_API_KEY}`;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          stadia: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution:
              '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [
          { id: 'stadia', type: 'raster', source: 'stadia', minzoom: 0, maxzoom: 22 },
        ],
      },
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
          'line-color': '#888',
          'line-width': 1,
          'line-dasharray': [3, 3],
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [initialCoords]);

  // trackPoints の更新を反映。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trackPoints.status !== 'ready') return;

    const apply = () => {
      const features = trackPoints.points.map<GeoJSON.Feature<GeoJSON.Point>>(
        (p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {},
        }),
      );
      const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: 'FeatureCollection',
        features,
      };
      const src = map.getSource('points') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
      } else {
        map.addSource('points', { type: 'geojson', data });
        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': 4,
            'circle-color': '#ffd400',
            'circle-stroke-color': '#666',
            'circle-stroke-width': 1,
          },
        });
      }
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
