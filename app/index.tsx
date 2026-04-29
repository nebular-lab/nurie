import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import MapView from 'react-native-maps';

const TOKYO_STATION = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView style={styles.map} initialRegion={TOKYO_STATION} />
    </>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
