import type { Track } from '@/feature/tracking/types';
import { haversineMeters } from '@/shared/utils/geo';

import { smoothCoords } from './smoothPath';

export type PlaybackCoord = [number, number];

type PlaybackSegment = {
  from: PlaybackCoord;
  to: PlaybackCoord;
  startM: number;
  lengthM: number;
};

export type PlaybackPath = {
  start: PlaybackCoord | null;
  totalM: number;
  segments: PlaybackSegment[];
};

export const PLAYBACK_SPEED_KMH = 10000;

export function buildPlaybackPath(tracks: Track[]): PlaybackPath {
  const segments: PlaybackSegment[] = [];
  let totalM = 0;
  let start: PlaybackCoord | null = null;

  const sorted = [...tracks].sort((a, b) => a.startedAt - b.startedAt);
  for (const track of sorted) {
    const coords = smoothCoords(track.path.coordinates);
    if (!start && coords.length > 0) start = coords[0];

    for (let i = 0; i < coords.length - 1; i++) {
      const from = coords[i];
      const to = coords[i + 1];
      const lengthM = coordDistanceM(from, to);
      if (lengthM <= 0) continue;
      segments.push({ from, to, startM: totalM, lengthM });
      totalM += lengthM;
    }
  }

  return { start, totalM, segments };
}

export function coordAtDistance(path: PlaybackPath, distanceM: number): PlaybackCoord | null {
  if (!path.start) return null;
  if (path.segments.length === 0) return path.start;

  const clampedM = Math.min(Math.max(distanceM, 0), path.totalM);
  const segment =
    path.segments.find(
      (s) => clampedM >= s.startM && clampedM <= s.startM + s.lengthM,
    ) ?? path.segments.at(-1);

  if (!segment) return path.start;

  const t =
    segment.lengthM === 0 ? 0 : (clampedM - segment.startM) / segment.lengthM;
  return [
    segment.from[0] + (segment.to[0] - segment.from[0]) * t,
    segment.from[1] + (segment.to[1] - segment.from[1]) * t,
  ];
}

export function kmhToMetersPerMs(kmh: number): number {
  return (kmh * 1000) / 60 / 60 / 1000;
}

function coordDistanceM(a: PlaybackCoord, b: PlaybackCoord): number {
  return haversineMeters(
    { lng: a[0], lat: a[1] },
    { lng: b[0], lat: b[1] },
  );
}
