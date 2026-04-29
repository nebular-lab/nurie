import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ZOOM_16 = {
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

const INITIAL_REGION = {
  latitude: 35.6812,
  longitude: 139.7671,
  ...ZOOM_16,
};

export default function Index() {
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const pendingRegionRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const insets = useSafeAreaInsets();

  const animateTo = useCallback((latitude: number, longitude: number) => {
    if (!mapReadyRef.current) {
      pendingRegionRef.current = { latitude, longitude };
      return;
    }
    mapRef.current?.animateToRegion(
      { latitude, longitude, ...ZOOM_16 },
      500,
    );
  }, []);

  const handleMapReady = () => {
    mapReadyRef.current = true;
    const pending = pendingRegionRef.current;
    if (pending) {
      pendingRegionRef.current = null;
      animateTo(pending.latitude, pending.longitude);
    }
  };

  const recenterToCurrent = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      animateTo(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      console.warn('[location] getCurrentPositionAsync failed', e);
    }
  }, [animateTo]);

  useEffect(() => {
    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        console.warn('[location] foreground permission not granted', fg.status);
        return;
      }
      await Location.requestBackgroundPermissionsAsync();

      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          animateTo(last.coords.latitude, last.coords.longitude);
        }
      } catch (e) {
        console.warn('[location] getLastKnownPositionAsync failed', e);
      }

      await recenterToCurrent();
    })();
  }, [animateTo, recenterToCurrent]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        onMapReady={handleMapReady}
      />
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
