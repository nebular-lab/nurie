// 描画用にスタイル済みのセグメント列を返す。
// View 側はこの結果を Polyline に流し込むだけで済む (色や破線の判断を持ち込まない)。

import { useMemo } from 'react';

import type { Point } from '../db';
import {
  buildSegments,
  colorForSegment,
  dateKey,
  type Segment,
} from '../segments';

export type DisplayedSegment = {
  startedAt: number;
  coords: { latitude: number; longitude: number }[];
  color: string;
  dashPattern: number[] | undefined;
};

export function useDisplayedSegments(points: Point[]): DisplayedSegment[] {
  const todayKey = dateKey(Date.now());

  return useMemo(() => {
    const segments = buildSegments(points);
    const pastWalkingDates = collectPastWalkingDates(segments, todayKey);
    return segments.map((seg) => ({
      startedAt: seg.startedAt,
      coords: seg.coords,
      color: colorForSegment(seg, pastWalkingDates, todayKey),
      dashPattern: seg.isWalking ? undefined : [6, 6],
    }));
  }, [points, todayKey]);
}

function collectPastWalkingDates(
  segments: Segment[],
  todayKey: string,
): string[] {
  const set = new Set<string>();
  for (const seg of segments) {
    if (seg.isWalking && seg.date !== todayKey) set.add(seg.date);
  }
  return Array.from(set).sort();
}
