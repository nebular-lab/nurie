import { useMemo } from 'react';

import type { StoredTrackPointsState } from '@/feature/tracking/hooks/useStoredTrackPoints';
import { RADIUS_BANDS_M } from '@/shared/constants/appConfig';

import { aggregateFogCoverageByBands } from '../utils/fogHex';

export function useFogCoverage(trackPoints: StoredTrackPointsState) {
  return useMemo(
    () =>
      trackPoints.status === 'ready'
        ? aggregateFogCoverageByBands(trackPoints.tracks, RADIUS_BANDS_M)
        : null,
    [trackPoints],
  );
}
