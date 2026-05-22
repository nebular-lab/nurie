import { Circle } from 'react-native-maps';

import { HOME, RADIUS_BANDS_M } from '../constants';

import { RADIUS_BAND_STYLE } from './mapOverlayStyle';

export function RadiusBandsOverlay() {
  return (
    <>
      {RADIUS_BANDS_M.map((radius) => (
        <Circle
          key={`band-${radius}`}
          center={{ latitude: HOME.lat, longitude: HOME.lng }}
          radius={radius}
          strokeColor={RADIUS_BAND_STYLE.strokeColor}
          strokeWidth={1}
          fillColor="transparent"
        />
      ))}
    </>
  );
}
