import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCenterMapOnLaunch } from '@/lib/hooks/useCenterMapOnLaunch';
import { useMapCamera } from '@/lib/hooks/useMapCamera';
import { useStartLocationTracking } from '@/lib/hooks/useStartLocationTracking';
import { useTrackPoints } from '@/lib/hooks/useTrackPoints';
import { buildSegments, colorForSegment, dateKey } from '@/lib/segments';

const INITIAL_REGION = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export default function Index() {
  const { mapRef, animateTo, onMapReady } = useMapCamera();
  const { points } = useTrackPoints();
  const insets = useSafeAreaInsets();

  useStartLocationTracking();
  useCenterMapOnLaunch({ animateTo });

  const segments = useMemo(() => buildSegments(points), [points]);
  const todayKey = dateKey(Date.now());
  const pastWalkingDates = useMemo(() => {
    const set = new Set<string>();
    for (const seg of segments) {
      if (seg.isWalking && seg.date !== todayKey) set.add(seg.date);
    }
    return Array.from(set).sort();
  }, [segments, todayKey]);

  const recenter = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      animateTo(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      console.warn('[location] getCurrentPositionAsync failed', e);
    }
  }, [animateTo]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        onMapReady={onMapReady}
      >
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            coordinates={seg.coords}
            strokeColor={colorForSegment(seg, pastWalkingDates, todayKey)}
            strokeWidth={4}
            lineDashPattern={seg.isWalking ? undefined : [6, 6]}
          />
        ))}
      </MapView>
      <Pressable
        style={[styles.recenterButton, { bottom: insets.bottom + 24 }]}
        onPress={recenter}
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
