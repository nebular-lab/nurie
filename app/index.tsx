import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SignInModal } from '@/feature/auth/components/SignInModal';
import { useAuthSession } from '@/feature/auth/hooks/useAuthSession';
import { ExplorationStatusBadge } from '@/feature/exploration/components/ExplorationStatusBadge';
import { Map } from '@/feature/exploration/components/Map';
import { TrackingToggleControl } from '@/feature/tracking/components/TrackingToggleControl';
import { useInitialLocation } from '@/feature/tracking/hooks/useInitialLocation';
import { useLocationTracking } from '@/feature/tracking/hooks/useLocationTracking';
import { useStoredTrackPoints } from '@/feature/tracking/hooks/useStoredTrackPoints';
import { useSyncTask } from '@/feature/tracking/hooks/useSyncTask';

export default function Index() {
  const initial = useInitialLocation();
  const trackPoints = useStoredTrackPoints();
  const tracking = useLocationTracking();
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

      <ExplorationStatusBadge
        sync={sync}
        tracking={tracking.state}
        trackPoints={trackPoints}
      />

      <TrackingToggleControl tracking={tracking} />

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
});
