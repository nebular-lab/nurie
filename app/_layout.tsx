import { Stack } from 'expo-router';

import '@/feature/tracking/effect/locationTask';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
