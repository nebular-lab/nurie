import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocationTrackingState } from '@/feature/tracking/hooks/useLocationTracking';
import type { StoredTrackPointsState } from '@/feature/tracking/hooks/useStoredTrackPoints';
import type { SyncStatus } from '@/feature/tracking/hooks/useSyncTask';

import { StatusBadge } from './StatusBadge';

const isWeb = Platform.OS === 'web';

export function ExplorationStatusBadge({
  sync,
  tracking,
  trackPoints,
}: {
  sync: SyncStatus;
  tracking: LocationTrackingState;
  trackPoints: StoredTrackPointsState;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.panel,
        isWeb && styles.webPanel,
        { top: insets.top + 12 },
      ]}
    >
      <StatusBadge tracking={tracking} trackPoints={trackPoints} />
      {sync.lastError && (
        <Text style={styles.syncError}>同期エラー: {sync.lastError}</Text>
      )}
      {sync.uploadedTotal > 0 && !sync.lastError && (
        <Text style={styles.syncInfo}>同期済み: {sync.uploadedTotal} 件</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(6, 18, 42, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(96, 210, 255, 0.32)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#60D2FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
    gap: 4,
  },
  webPanel: {
    left: '50%',
    right: 'auto',
    width: 360,
    transform: [{ translateX: -180 }],
  },
  syncError: {
    fontSize: 12,
    color: '#FF8FAF',
  },
  syncInfo: {
    fontSize: 12,
    color: '#B9EFFF',
  },
});
