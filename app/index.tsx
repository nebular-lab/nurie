import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDisplayedSegments } from '@/lib/hooks/useDisplayedSegments';
import { useMapCamera } from '@/lib/hooks/useMapCamera';
import { useMapCentering } from '@/lib/hooks/useMapCentering';
import { useStartLocationTracking } from '@/lib/hooks/useStartLocationTracking';
import { useStoredTrackPoints } from '@/lib/hooks/useStoredTrackPoints';

const INITIAL_REGION = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export default function Index() {
  const { mapRef, centerMapOn, onMapReady } = useMapCamera();
  const trackPoints = useStoredTrackPoints();
  const displayedSegments = useDisplayedSegments(trackPoints);
  const recenterMap = useMapCentering(centerMapOn);
  const insets = useSafeAreaInsets();

  useStartLocationTracking();

  return (
    <>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
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
