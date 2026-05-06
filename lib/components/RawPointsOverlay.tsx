import { Circle } from 'react-native-maps';

import type { Point } from '../db';

const FILL_COLOR = 'rgba(255, 204, 0, 0.85)';
const STROKE_COLOR = 'rgba(170, 130, 0, 0.9)';
const RADIUS_M = 3;

export function RawPointsOverlay({ points }: { points: Point[] }) {
  return (
    <>
      {points.map((p) => (
        <Circle
          key={`raw-${p.id}`}
          center={{ latitude: p.lat, longitude: p.lng }}
          radius={RADIUS_M}
          strokeColor={STROKE_COLOR}
          strokeWidth={1}
          fillColor={FILL_COLOR}
        />
      ))}
    </>
  );
}
