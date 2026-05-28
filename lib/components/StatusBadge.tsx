import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMemo } from 'react';

import { RADIUS_BANDS_M } from '../constants';
import { aggregateFogCoverageByBands } from '../fogHex';
import type { LocationTrackingState } from '../hooks/useLocationTracking';
import type { StoredTrackPointsState } from '../hooks/useStoredTrackPoints';

export function StatusBadge({
  tracking,
  trackPoints,
}: {
  tracking: LocationTrackingState;
  trackPoints: StoredTrackPointsState;
}) {
  const totals = useMemo(
    () =>
      trackPoints.status === 'ready'
        ? aggregateFogCoverageByBands(trackPoints.tracks, RADIUS_BANDS_M)
        : null,
    [trackPoints],
  );

  if (tracking.status === 'error') {
    return <ErrorRow message={`記録エラー: ${tracking.message}`} />;
  }
  if (trackPoints.status === 'error') {
    return (
      <ErrorRow message={`歩行履歴の読み込み失敗: ${trackPoints.message}`} />
    );
  }
  if (trackPoints.status === 'loading') {
    return <LoadingRow message="計算中…" />;
  }

  return (
    <View style={styles.bandRow}>
      {RADIUS_BANDS_M.map((r, i) => (
        <Text key={r} style={styles.bandItem}>
          {r / 1000}km: {formatPercent(totals![i])}%
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
  totalTiles,
  revealedTiles,
}: {
  totalTiles: number;
  revealedTiles: number;
}): string {
  return totalTiles > 0 ? ((revealedTiles / totalTiles) * 100).toFixed(1) : '0.0';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 14,
    color: '#B9EFFF',
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bandItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DDF7FF',
  },
  errorText: {
    fontSize: 14,
    color: '#FF8FAF',
    flex: 1,
  },
});
