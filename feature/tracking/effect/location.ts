import * as Location from 'expo-location';

export async function getCurrentCoords(): Promise<{
  latitude: number;
  longitude: number;
}> {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
}
