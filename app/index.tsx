import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAllPoints, type Point } from '@/lib/db';
import { startTracking } from '@/lib/locationTask';
import { buildSegments, colorForSegment, dateKey } from '@/lib/segments';

const ZOOM_16 = {
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

const INITIAL_REGION = {
  latitude: 35.6812,
  longitude: 139.7671,
  ...ZOOM_16,
};

const FIT_PADDING = { top: 80, bottom: 80, left: 80, right: 80 };

type Coord = { latitude: number; longitude: number };

export default function Index() {
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const pendingRegionRef = useRef<Coord | null>(null);
  const pendingFitRef = useRef<Coord[] | null>(null);
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState<Point[]>([]);

  const animateTo = useCallback((latitude: number, longitude: number) => {
    pendingFitRef.current = null;
    if (!mapReadyRef.current) {
      pendingRegionRef.current = { latitude, longitude };
      return;
    }
    mapRef.current?.animateToRegion({ latitude, longitude, ...ZOOM_16 }, 500);
  }, []);

  const fitTo = useCallback((coords: Coord[]) => {
    if (coords.length < 2) return;
    if (!mapReadyRef.current) {
      pendingFitRef.current = coords;
      return;
    }
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: FIT_PADDING,
      animated: true,
    });
  }, []);

  const handleMapReady = () => {
    mapReadyRef.current = true;
    const pendingFit = pendingFitRef.current;
    const pendingRegion = pendingRegionRef.current;
    if (pendingFit) {
      pendingFitRef.current = null;
      fitTo(pendingFit);
    } else if (pendingRegion) {
      pendingRegionRef.current = null;
      animateTo(pendingRegion.latitude, pendingRegion.longitude);
    }
  };

  const recenterToCurrent = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      animateTo(loc.coords.latitude, loc.coords.longitude);
      return true;
    } catch (e) {
      console.warn('[location] getCurrentPositionAsync failed', e);
      return false;
    }
  }, [animateTo]);

  const reloadPoints = useCallback(async () => {
    try {
      const all = await getAllPoints();
      setPoints(all);
      return all;
    } catch (e) {
      console.warn('[track] getAllPoints failed', e);
      return [] as Point[];
    }
  }, []);

  useEffect(() => {
    (async () => {
      const initial = await reloadPoints();

      const fg = await Location.requestForegroundPermissionsAsync();
      let cameraDone = false;

      if (fg.status === 'granted') {
        await Location.requestBackgroundPermissionsAsync();

        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            animateTo(last.coords.latitude, last.coords.longitude);
            cameraDone = true;
          }
        } catch (e) {
          console.warn('[location] getLastKnownPositionAsync failed', e);
        }

        const ok = await recenterToCurrent();
        if (ok) cameraDone = true;

        try {
          await startTracking();
        } catch (e) {
          console.warn('[track] startTracking failed', e);
        }
      } else {
        console.warn('[location] foreground permission not granted', fg.status);
      }

      if (!cameraDone) {
        if (initial.length === 1) {
          animateTo(initial[0].lat, initial[0].lng);
        } else if (initial.length >= 2) {
          fitTo(
            initial.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          );
        }
      }
    })();
  }, [animateTo, fitTo, recenterToCurrent, reloadPoints]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reloadPoints();
      }
    });
    return () => sub.remove();
  }, [reloadPoints]);

  const segments = useMemo(() => buildSegments(points), [points]);
  const todayKey = dateKey(Date.now());
  const pastWalkingDates = useMemo(() => {
    const set = new Set<string>();
    for (const seg of segments) {
      if (seg.isWalking && seg.date !== todayKey) set.add(seg.date);
    }
    return Array.from(set).sort();
  }, [segments, todayKey]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        onMapReady={handleMapReady}
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
        onPress={recenterToCurrent}
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
