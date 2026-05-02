import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDisplayedSegments } from '@/lib/hooks/useDisplayedSegments';
import { MAP_ZOOM_DELTA, useMapCamera } from '@/lib/hooks/useMapCamera';
import { useInitialLocation } from '@/lib/hooks/useInitialLocation';
import { useRecenterMap } from '@/lib/hooks/useRecenterMap';
import { useStartLocationTracking } from '@/lib/hooks/useStartLocationTracking';
import { useStoredTrackPoints } from '@/lib/hooks/useStoredTrackPoints';

export default function Index() {
  const initial = useInitialLocation();
  const { mapRef, centerMapOn, onMapReady } = useMapCamera();
  const trackPoints = useStoredTrackPoints();
  const displayedSegments = useDisplayedSegments(trackPoints);
  const recenterMap = useRecenterMap(centerMapOn);
  const insets = useSafeAreaInsets();

  useStartLocationTracking();

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
        onMapReady={onMapReady}
      >
        {displayedSegments.map((seg) => (
          <Polyline
            key={seg.startedAt}
            coordinates={seg.coords}
            strokeColor={seg.color}
            strokeWidth={4}
            lineDashPattern={seg.dashPattern}
          />
        ))}
      </MapView>
      <Pressable
        style={[styles.recenterButton, { bottom: insets.bottom + 24 }]}
        onPress={recenterMap}
      >
        <View style={styles.recenterDot} />
      </Pressable>
    </>
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
});
