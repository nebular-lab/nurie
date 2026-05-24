// Native の地図 + オーバーレイ + RecenterButton をまとめたコンポーネント。
// app/index.tsx は initial / coverage / trackPoints を渡すだけで、地図周辺の責務は
// すべて Map 内部に閉じる。Web 版 (Map.web.tsx) と同じ Props を受ける。

import { useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CoverageResult } from '../coverage';
import type { StoredTrackPointsState } from '../hooks/useStoredTrackPoints';
import { MAP_ZOOM_DELTA, useMapCamera } from '../hooks/useMapCamera';
import { useRecenterMap } from '../hooks/useRecenterMap';
import { useTilesReady } from '../hooks/useTilesReady';

import { RadiusBandsOverlay } from './RadiusBandsOverlay';
import { RecenterButton } from './RecenterButton';
import { TileLoadingOverlay } from './TileLoadingOverlay';
import { TrackPathsOverlay } from './TrackPathsOverlay';
import { WalkedRoadsOverlay } from './WalkedRoadsOverlay';

const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;

export type MapProps = {
  initialCoords: { latitude: number; longitude: number };
  coverage: CoverageResult | null;
  trackPoints: StoredTrackPointsState;
};

export function Map({ initialCoords, coverage, trackPoints }: MapProps) {
  const insets = useSafeAreaInsets();
  const { mapRef, centerMapOn, onMapReady } = useMapCamera();
  const recenterMap = useRecenterMap(centerMapOn);
  const [mapReady, setMapReady] = useState(false);
  const tilesReady = useTilesReady(mapReady);

  const tileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${STADIA_API_KEY}`;

  return (
    <>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ ...initialCoords, ...MAP_ZOOM_DELTA }}
        showsUserLocation
        onMapReady={() => {
          onMapReady();
          setMapReady(true);
        }}
      >
        <UrlTile urlTemplate={tileUrl} maximumZ={20} shouldReplaceMapContent />
        <RadiusBandsOverlay />
        <WalkedRoadsOverlay coverage={coverage} />
        {trackPoints.status === 'ready' && (
          <TrackPathsOverlay tracks={trackPoints.tracks} />
        )}
      </MapView>

      <RecenterButton bottom={insets.bottom + 24} onPress={recenterMap} />
      <TileLoadingOverlay visible={!tilesReady} />
    </>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
