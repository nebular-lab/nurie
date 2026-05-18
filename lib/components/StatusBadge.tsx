import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { aggregateCoverageByBands, type CoverageResult } from '../coverage';
import { RADIUS_BANDS_M } from '../constants';
import type { LocationTrackingState } from '../hooks/useLocationTracking';
import type { WalkableRoadsState } from '../hooks/useWalkableRoads';
import type { StoredTrackPointsState } from '../hooks/useStoredTrackPoints';

export function StatusBadge({
  roads,
  tracking,
  trackPoints,
  coverage,
}: {
  roads: WalkableRoadsState;
  tracking: LocationTrackingState;
  trackPoints: StoredTrackPointsState;
  coverage: CoverageResult | null;
}) {
  if (tracking.status === 'error') {
    return <ErrorRow message={`記録エラー: ${tracking.message}`} />;
  }
  if (trackPoints.status === 'error') {
    return (
      <ErrorRow message={`歩行履歴の読み込み失敗: ${trackPoints.message}`} />
    );
  }
  if (roads.status === 'loading') {
    return <LoadingRow message="道路データを取得中…" withSpinner />;
  }
  if (roads.status === 'error') {
    return (
      <View style={styles.row}>
        <Text style={styles.errorText}>道路データ取得失敗: {roads.message}</Text>
        <Pressable onPress={roads.retry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>再試行</Text>
        </Pressable>
      </View>
    );
  }
  if (trackPoints.status === 'loading' || !coverage) {
    return <LoadingRow message="計算中…" />;
  }

  const totals = aggregateCoverageByBands(coverage, RADIUS_BANDS_M);
  return (
    <View style={styles.bandRow}>
      {RADIUS_BANDS_M.map((r, i) => (
        <Text key={r} style={styles.bandItem}>
          {r / 1000}km: {formatPercent(totals[i])}%
        </Text>
      ))}
    </View>
  );
}

function LoadingRow({
  message,
  withSpinner = false,
}: {
  message: string;
  withSpinner?: boolean;
}) {
  return (
    <View style={styles.row}>
      {withSpinner && <ActivityIndicator size="small" />}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function formatPercent({
  totalM,
  walkedM,
}: {
  totalM: number;
  walkedM: number;
}): string {
  return totalM > 0 ? ((walkedM / totalM) * 100).toFixed(1) : '0.0';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 14,
    color: '#666',
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bandItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  errorText: {
    fontSize: 14,
    color: '#c0392b',
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
