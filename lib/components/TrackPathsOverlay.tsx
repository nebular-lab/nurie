import { useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import type { Track } from '../remoteTracks';
import { smoothCoords } from '../smoothPath';

import { TRACK_PATH_STYLE } from './mapOverlayStyle';

export function TrackPathsOverlay({ tracks }: { tracks: Track[] }) {
  const overlays = useMemo(
    () =>
      tracks.flatMap((track) => {
        const coords = smoothCoords(track.path.coordinates);
        if (coords.length < 2) return [];
        const coordinates = coords.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        return [
          <Polyline
            key={`track-casing-${track.id}`}
            coordinates={coordinates}
            strokeColor={TRACK_PATH_STYLE.casingColor}
            strokeWidth={TRACK_PATH_STYLE.casingWidth}
          />,
          <Polyline
            key={`track-${track.id}`}
            coordinates={coordinates}
            strokeColor={TRACK_PATH_STYLE.strokeColor}
            strokeWidth={TRACK_PATH_STYLE.strokeWidth}
          />,
        ];
      }),
    [tracks],
  );

  return <>{overlays}</>;
}
