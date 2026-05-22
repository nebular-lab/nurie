import { Circle } from 'react-native-maps';

import type { Point } from '../db';

import { RAW_POINT_STYLE } from './mapOverlayStyle';

export function RawPointsOverlay({ points }: { points: Point[] }) {
  return (
    <>
      {points.map((p) => (
        <Circle
          key={`raw-${p.id}`}
          center={{ latitude: p.lat, longitude: p.lng }}
          radius={RAW_POINT_STYLE.radiusM}
          strokeColor={RAW_POINT_STYLE.strokeColor}
          strokeWidth={1}
          fillColor={RAW_POINT_STYLE.fillColor}
        />
      ))}
    </>
  );
}
