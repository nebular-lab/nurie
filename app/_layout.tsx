import { Stack } from 'expo-router';

import '@/lib/locationTask';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
