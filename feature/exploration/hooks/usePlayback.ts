import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Track } from '@/feature/tracking/types';

import {
  buildPlaybackPath,
  coordAtDistance,
  kmhToMetersPerMs,
  PLAYBACK_SPEED_KMH,
} from '../utils/playbackPath';

export function usePlayback(tracks: Track[]) {
  const animationRef = useRef<number | null>(null);
  const [playbackDistanceM, setPlaybackDistanceM] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackPath = useMemo(() => buildPlaybackPath(tracks), [tracks]);
  const playbackCoord = useMemo(
    () =>
      playbackDistanceM === null
        ? null
        : coordAtDistance(playbackPath, playbackDistanceM),
    [playbackDistanceM, playbackPath],
  );

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    },
    [],
  );

  const playPath = useCallback(() => {
    if (playbackPath.totalM <= 0) return;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    setIsPlaying(true);
    setPlaybackDistanceM(0);

    const speedMPerMs = kmhToMetersPerMs(PLAYBACK_SPEED_KMH);
    let startMs: number | null = null;
    const tick = (nowMs: number) => {
      startMs ??= nowMs;
      const distanceM = (nowMs - startMs) * speedMPerMs;
      setPlaybackDistanceM(Math.min(distanceM, playbackPath.totalM));

      if (distanceM < playbackPath.totalM) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        setIsPlaying(false);
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  }, [playbackPath]);

  return {
    disabled: playbackPath.totalM <= 0,
    isPlaying,
    playPath,
    playbackCoord,
    playbackPath,
  };
}
