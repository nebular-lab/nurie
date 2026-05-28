import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignInModal } from '@/feature/auth/components/SignInModal';
import { useAuthSession } from '@/feature/auth/hooks/useAuthSession';
import { Map } from '@/feature/exploration/components/Map';
import { StatusBadge } from '@/feature/exploration/components/StatusBadge';
import { TrackingToggleButton } from '@/feature/tracking/components/TrackingToggleButton';
import { useInitialLocation } from '@/feature/tracking/hooks/useInitialLocation';
import { useLocationTracking } from '@/feature/tracking/hooks/useLocationTracking';
import { useStoredTrackPoints } from '@/feature/tracking/hooks/useStoredTrackPoints';
import { useSyncTask } from '@/feature/tracking/hooks/useSyncTask';

const isWeb = Platform.OS === 'web';
const MAP_BUTTON_BOTTOM_OFFSET = 24;

export default function Index() {
  const initial = useInitialLocation();
  const insets = useSafeAreaInsets();
  const trackPoints = useStoredTrackPoints();
  const { state: tracking, start, stop } = useLocationTracking();
  const auth = useAuthSession();
  const sync = useSyncTask(auth.status === 'signed-in' ? auth.user.id : null);

  if (initial.status === 'loading') {
    return <LoadingScreen />;
  }
  if (initial.status === 'error') {
    return (
      <ErrorScreen
        title="現在地を取得できませんでした"
        detail={initial.message}
        onRetry={initial.retry}
      />
    );
  }

  return (
    <>
      <Map
        initialCoords={initial.coords}
        trackPoints={trackPoints}
      />

      <View
        style={[
          styles.panel,
          isWeb && styles.webPanel,
          { top: insets.top + 12 },
        ]}
      >
        <StatusBadge
          tracking={tracking}
          trackPoints={trackPoints}
        />
        {sync.lastError && (
          <Text style={styles.syncError}>同期エラー: {sync.lastError}</Text>
        )}
        {sync.uploadedTotal > 0 && !sync.lastError && (
          <Text style={styles.syncInfo}>
            同期済み: {sync.uploadedTotal} 件
          </Text>
        )}
      </View>

      {!isWeb && (
        <TrackingToggleButton
          bottom={insets.bottom + MAP_BUTTON_BOTTOM_OFFSET}
          isEnabled={tracking.isEnabled}
          disabled={tracking.status === 'starting'}
          onPress={() => {
            if (tracking.isEnabled) {
              void stop();
            } else {
              void start();
            }
          }}
        />
      )}

      <SignInModal
        visible={auth.status === 'signed-out' || auth.status === 'error'}
      />
    </>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function ErrorScreen({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{title}</Text>
      {detail && <Text style={styles.errorDetail}>{detail}</Text>}
      {onRetry && (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>再試行</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  errorDetail: {
    fontSize: 13,
    marginBottom: 16,
    color: '#777',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
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
