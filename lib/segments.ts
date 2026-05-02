import type { Point } from './db';
import { haversineMeters } from './geo';

export function dateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SESSION_GAP_MAX_MS = 15 * 60 * 1000;
const WALKING_MAX_KMH = 12;
const WALKING_MAX_SPEED_MS = (WALKING_MAX_KMH * 1000) / 3600;

export type Segment = {
  startedAt: number;
  coords: { latitude: number; longitude: number }[];
  isWalking: boolean;
  date: string;
};

export function buildSegments(points: Point[]): Segment[] {
  if (points.length < 2) return [];

  const segments: Segment[] = [];
  let current: Segment | null = null;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dtMs = b.recordedAt - a.recordedAt;

    if (dtMs <= 0 || dtMs > SESSION_GAP_MAX_MS) {
      current = null;
      continue;
    }

    const dist = haversineMeters(
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
    );
    const speedMs = dist / (dtMs / 1000);
    const isWalking = speedMs <= WALKING_MAX_SPEED_MS;
    const date = dateKey(b.recordedAt);

    if (current && current.isWalking === isWalking && current.date === date) {
      current.coords.push({ latitude: b.lat, longitude: b.lng });
    } else {
      current = {
        startedAt: a.recordedAt,
        coords: [
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng },
        ],
        isWalking,
        date,
      };
      segments.push(current);
    }
  }

  return segments;
}

const TODAY_COLOR = '#FF3B30';
const NON_WALKING_COLOR = 'rgba(160, 160, 160, 0.6)';
const PAST_DARKEST = 0x40;
const PAST_LIGHTEST = 0xd0;

export function colorForSegment(
  seg: Segment,
  pastWalkingDates: string[],
  todayKey: string,
): string {
  if (!seg.isWalking) return NON_WALKING_COLOR;
  if (seg.date === todayKey) return TODAY_COLOR;

  const idx = pastWalkingDates.indexOf(seg.date);
  if (idx === -1) return greyHex(PAST_DARKEST);

  const t =
    pastWalkingDates.length === 1 ? 1 : idx / (pastWalkingDates.length - 1);
  const value = Math.round(PAST_LIGHTEST - t * (PAST_LIGHTEST - PAST_DARKEST));
  return greyHex(value);
}

function greyHex(value: number): string {
  const hex = value.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}
