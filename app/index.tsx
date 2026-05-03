import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Polyline, UrlTile } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BUFFER_M } from '@/lib/constants';
import { useCoverage } from '@/lib/hooks/useCoverage';
import { MAP_ZOOM_DELTA, useMapCamera } from '@/lib/hooks/useMapCamera';
import { useInitialLocation } from '@/lib/hooks/useInitialLocation';
import { useOsmRoads } from '@/lib/hooks/useOsmRoads';
import { useRecenterMap } from '@/lib/hooks/useRecenterMap';
import { useStartLocationTracking } from '@/lib/hooks/useStartLocationTracking';
import { useStoredTrackPoints } from '@/lib/hooks/useStoredTrackPoints';

const WALKED_ROAD_COLOR = '#FF3B30';
const UNWALKED_ROAD_COLOR = 'rgba(120, 120, 120, 0.35)';

// Stadia Alidade Smooth: データオーバーレイ用の neutral basemap。
// API キーは .env / .env.local の EXPO_PUBLIC_STADIA_API_KEY から読む。
const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY ?? '';
const TILE_URL = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${STADIA_API_KEY}`;

export default function Index() {
  const initial = useInitialLocation();
  const { mapRef, centerMapOn, onMapReady } = useMapCamera();
  const trackPoints = useStoredTrackPoints();
  const recenterMap = useRecenterMap(centerMapOn);
  const insets = useSafeAreaInsets();
  const osm = useOsmRoads();
  const coverage = useCoverage(
    trackPoints,
    osm.status === 'ready' ? osm.roads : null,
    BUFFER_M,
  );

  // タイルが乗るまで Apple Maps の基底が一瞬チラつくのを白いオーバーレイで隠す。
  // UrlTile に「読み込み完了」コールバックは無いので、onMapReady から少し遅延させる。
  const [mapReady, setMapReady] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);

  useEffect(() => {
    if (!mapReady) return;
    const timer = setTimeout(() => setTilesReady(true), 1200);
    return () => clearTimeout(timer);
  }, [mapReady]);

  useStartLocationTracking();

  const roadOverlays = useMemo(() => {
    if (!coverage) return null;
    return coverage.roads.flatMap((rc) => [
      ...rc.unwalkedSegments.map((seg, j) => (
        <Polyline
          key={`u-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={UNWALKED_ROAD_COLOR}
          strokeWidth={3}
        />
      )),
      ...rc.walkedSegments.map((seg, j) => (
        <Polyline
          key={`w-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={WALKED_ROAD_COLOR}
          strokeWidth={6}
        />
      )),
    ]);
  }, [coverage]);

  if (initial.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (initial.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>現在地を取得できませんでした</Text>
        <Pressable style={styles.retryButton} onPress={initial.retry}>
          <Text style={styles.retryText}>再試行</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ ...initial.coords, ...MAP_ZOOM_DELTA }}
        showsUserLocation
        onMapReady={() => {
          onMapReady();
          setMapReady(true);
        }}
      >
        <UrlTile
          urlTemplate={TILE_URL}
          maximumZ={20}
          shouldReplaceMapContent
        />
        {roadOverlays}
      </MapView>

      <View style={[styles.panel, { top: insets.top + 12 }]}>
        <CoverageBadge osm={osm} coverage={coverage} />
      </View>

      <Pressable
        style={[styles.recenterButton, { bottom: insets.bottom + 24 }]}
        onPress={recenterMap}
      >
        <View style={styles.recenterDot} />
      </Pressable>

      {!tilesReady && (
        <View style={styles.tileLoadingOverlay}>
          <ActivityIndicator size="large" color="#888" />
          <Text style={styles.tileLoadingText}>地図を読み込み中…</Text>
        </View>
      )}
    </>
  );
}

function CoverageBadge({
  osm,
  coverage,
}: {
  osm: ReturnType<typeof useOsmRoads>;
  coverage: ReturnType<typeof useCoverage>;
}) {
  if (osm.status === 'loading') {
    return (
      <View style={styles.badgeRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.badgeText}>道路データを取得中…</Text>
      </View>
    );
  }
  if (osm.status === 'error') {
    return (
      <View style={styles.badgeRow}>
        <Text style={styles.errorBadge}>道路データ取得失敗</Text>
        <Pressable onPress={osm.retry} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>再試行</Text>
        </Pressable>
      </View>
    );
  }
  if (!coverage) {
    return (
      <View style={styles.badgeRow}>
        <Text style={styles.badgeText}>計算中…</Text>
      </View>
    );
  }
  const pct = (coverage.ratio * 100).toFixed(1);
  const walkedKm = (coverage.walkedM / 1000).toFixed(2);
  const totalKm = (coverage.totalM / 1000).toFixed(2);
  return (
    <View>
      <Text style={styles.percentText}>{pct}%</Text>
      <Text style={styles.subText}>
        {walkedKm} / {totalKm} km · 誤差 ±{BUFFER_M}m
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
    color: '#333',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeText: {
    fontSize: 14,
    color: '#666',
  },
  percentText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  subText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  errorBadge: {
    fontSize: 14,
    color: '#c0392b',
    flex: 1,
  },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recenterButton: {
    position: 'absolute',
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  recenterDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  tileLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  tileLoadingText: {
    fontSize: 14,
    color: '#666',
  },
});
