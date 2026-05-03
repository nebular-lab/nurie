import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Polyline, UrlTile } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BUFFER_M, HOME } from '@/lib/constants';
import { useCoverage } from '@/lib/hooks/useCoverage';
import { MAP_ZOOM_DELTA, useMapCamera } from '@/lib/hooks/useMapCamera';
import { useInitialLocation } from '@/lib/hooks/useInitialLocation';
import { useOsmRoads } from '@/lib/hooks/useOsmRoads';
import { useRecenterMap } from '@/lib/hooks/useRecenterMap';
import { useStartLocationTracking } from '@/lib/hooks/useStartLocationTracking';
import { useStoredTrackPoints } from '@/lib/hooks/useStoredTrackPoints';

// 道路の色: 過去歩行=薄い赤、今日歩行=緑 (未踏は描かない)
const PAST_WALKED_COLOR = '#FF9999';
const TODAY_WALKED_COLOR = '#34C759';

// 自宅からの半径バンド (歩行率の集計と地図上の同心円描画に使う)
const RADIUS_BANDS_M = [1000, 3000, 5000] as const;

// Stadia Alidade Smooth: データオーバーレイ用に設計された neutral basemap。
// 道路が滑らかに集約されて 1 本線寄りになる (大通りの歩道平行ラインが目立ちにくい)。
// API キーは .env.local の EXPO_PUBLIC_STADIA_API_KEY から読む。
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

  // 歩行済みレイヤー: 過去 → 今日 の順で重ねる。歩行履歴の更新でだけ再生成。
  const walkedOverlays = useMemo(() => {
    if (!coverage) return null;
    return coverage.roads.flatMap((rc) => [
      ...rc.walkedPastSegments.map((seg, j) => (
        <Polyline
          key={`p-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={PAST_WALKED_COLOR}
          strokeWidth={5}
        />
      )),
      ...rc.walkedTodaySegments.map((seg, j) => (
        <Polyline
          key={`t-${rc.road.id}-${j}`}
          coordinates={seg.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }))}
          strokeColor={TODAY_WALKED_COLOR}
          strokeWidth={5}
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
        {RADIUS_BANDS_M.map((radius) => (
          <Circle
            key={`band-${radius}`}
            center={{ latitude: HOME.lat, longitude: HOME.lng }}
            radius={radius}
            strokeColor="rgba(0, 0, 0, 0.35)"
            strokeWidth={1}
            fillColor="transparent"
          />
        ))}
        {walkedOverlays}
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
  // 半径バンドごとに「最短距離が R 以内の道路」だけを集計する。
  // バンドはネスト関係 (1km ⊂ 3km ⊂ 5km) なので、1km の道は 3km / 5km にも含まれる。
  const totals = RADIUS_BANDS_M.map(() => ({ total: 0, walked: 0 }));
  for (const rc of coverage.roads) {
    const d = rc.road.minDistFromHome;
    const walked = rc.walkedTodayM + rc.walkedPastM;
    for (let i = 0; i < RADIUS_BANDS_M.length; i++) {
      if (d <= RADIUS_BANDS_M[i]) {
        totals[i].total += rc.totalM;
        totals[i].walked += walked;
      }
    }
  }
  const pct = (t: { total: number; walked: number }) =>
    t.total > 0 ? ((t.walked / t.total) * 100).toFixed(1) : '0.0';
  return (
    <View style={styles.bandRow}>
      {RADIUS_BANDS_M.map((r, i) => (
        <Text key={r} style={styles.bandItem}>
          {r / 1000}km: {pct(totals[i])}%
        </Text>
      ))}
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
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bandItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
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
