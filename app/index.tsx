import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RadiusBandsOverlay } from '@/lib/components/RadiusBandsOverlay';
import { RecenterButton } from '@/lib/components/RecenterButton';
import { StatusBadge } from '@/lib/components/StatusBadge';
import { TileLoadingOverlay } from '@/lib/components/TileLoadingOverlay';
import { WalkedRoadsOverlay } from '@/lib/components/WalkedRoadsOverlay';
import { BUFFER_M } from '@/lib/constants';
import { useCoverage } from '@/lib/hooks/useCoverage';
import { useInitialLocation } from '@/lib/hooks/useInitialLocation';
import { useLocationTracking } from '@/lib/hooks/useLocationTracking';
import { MAP_ZOOM_DELTA, useMapCamera } from '@/lib/hooks/useMapCamera';
import { useWalkableRoads } from '@/lib/hooks/useWalkableRoads';
import { useRecenterMap } from '@/lib/hooks/useRecenterMap';
import { useStoredTrackPoints } from '@/lib/hooks/useStoredTrackPoints';
import { useTilesReady } from '@/lib/hooks/useTilesReady';

// Stadia Alidade Smooth: データオーバーレイ用に設計された neutral basemap。
// API キーは .env の EXPO_PUBLIC_STADIA_API_KEY から読む。未設定なら起動を止めて画面に出す
// (空文字で結合して壊れた URL を作るのは不自然な fallback)。
const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;

export default function Index() {
  const initial = useInitialLocation();
  const insets = useSafeAreaInsets();
  const { mapRef, centerMapOn, onMapReady } = useMapCamera();
  const recenterMap = useRecenterMap(centerMapOn);
  const trackPoints = useStoredTrackPoints();
  const roads = useWalkableRoads();
  const tracking = useLocationTracking();
  const coverage = useCoverage(
    trackPoints.status === 'ready' ? trackPoints.points : null,
    roads.status === 'ready' ? roads.list : null,
    BUFFER_M,
  );

  const [mapReady, setMapReady] = useState(false);
  const tilesReady = useTilesReady(mapReady);

  if (!STADIA_API_KEY) {
    return (
      <ErrorScreen title="EXPO_PUBLIC_STADIA_API_KEY が設定されていません" />
    );
  }
  if (initial.status === 'loading') {
    return <LoadingScreen />;
  }
  if (initial.status === 'error') {
    return (
      <ErrorScreen
        title="現在地を取得できませんでした"
        detail={initial.message}
        onRetry={initial.retry}
      />
    );
  }

  const tileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${STADIA_API_KEY}`;

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
        <UrlTile urlTemplate={tileUrl} maximumZ={20} shouldReplaceMapContent />
        <RadiusBandsOverlay />
        <WalkedRoadsOverlay coverage={coverage} />
      </MapView>

      <View style={[styles.panel, { top: insets.top + 12 }]}>
        <StatusBadge
          roads={roads}
          tracking={tracking}
          trackPoints={trackPoints}
          coverage={coverage}
        />
      </View>

      <RecenterButton bottom={insets.bottom + 24} onPress={recenterMap} />
      <TileLoadingOverlay visible={!tilesReady} />
    </>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function ErrorScreen({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{title}</Text>
      {detail && <Text style={styles.errorDetail}>{detail}</Text>}
      {onRetry && (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>再試行</Text>
        </Pressable>
      )}
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
  errorTitle: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  errorDetail: {
    fontSize: 13,
    marginBottom: 16,
    color: '#777',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  retryButtonText: {
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
});
