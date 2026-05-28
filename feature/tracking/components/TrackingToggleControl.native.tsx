import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocationTrackingControls } from '../hooks/useLocationTracking';
import { TrackingToggleButton } from './TrackingToggleButton';

const MAP_BUTTON_BOTTOM_OFFSET = 24;

export function TrackingToggleControl({
  tracking,
}: {
  tracking: LocationTrackingControls;
}) {
  const insets = useSafeAreaInsets();

  return (
    <TrackingToggleButton
      bottom={insets.bottom + MAP_BUTTON_BOTTOM_OFFSET}
      isEnabled={tracking.state.isEnabled}
      disabled={tracking.state.status === 'starting'}
      onPress={() => {
        if (tracking.state.isEnabled) {
          void tracking.stop();
        } else {
          void tracking.start();
        }
      }}
    />
  );
}
