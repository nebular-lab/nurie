import { Circle } from 'react-native-maps';

import { HOME, RADIUS_BANDS_M } from '../constants';

const STROKE_COLOR = 'rgba(0, 0, 0, 0.35)';

export function RadiusBandsOverlay() {
  return (
    <>
      {RADIUS_BANDS_M.map((radius) => (
        <Circle
          key={`band-${radius}`}
          center={{ latitude: HOME.lat, longitude: HOME.lng }}
          radius={radius}
          strokeColor={STROKE_COLOR}
          strokeWidth={1}
          fillColor="transparent"
        />
      ))}
    </>
  );
}
