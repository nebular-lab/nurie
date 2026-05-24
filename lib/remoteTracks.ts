import type { Point } from './db';
import { supabase } from './supabase';

type Coord = [number, number];

export type TrackPath = {
  type: 'LineString';
  coordinates: Coord[];
};

type TrackRow = {
  id: string;
  started_at: string;
  ended_at: string;
  path: unknown;
};

export type Track = {
  id: string;
  startedAt: number;
  endedAt: number;
  path: TrackPath;
};

export type TrackUploadRow = {
  user_id: string;
  started_at: string;
  ended_at: string;
  path: TrackPath;
  point_count: number;
};

export function buildTrackUploadRow(
  userId: string,
  points: Point[],
): TrackUploadRow {
  const sorted = [...points].sort((a, b) => a.recordedAt - b.recordedAt);
  const startedAt = sorted[0]?.recordedAt ?? Date.now();
  const endedAt = sorted.at(-1)?.recordedAt ?? startedAt;

  return {
    user_id: userId,
    started_at: new Date(Math.round(startedAt)).toISOString(),
    ended_at: new Date(Math.round(endedAt)).toISOString(),
    path: {
      type: 'LineString',
      coordinates: sorted.map((p) => [p.lng, p.lat]),
    },
    point_count: sorted.length,
  };
}

export async function fetchRemoteTrackPoints(): Promise<Point[]> {
  return tracksToPoints(await fetchRemoteTracks());
}

export async function fetchRemoteTracks(): Promise<Track[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('id, started_at, ended_at, path')
    .order('started_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data.flatMap(trackRowToTrack);
}

export function tracksToPoints(tracks: Track[]): Point[] {
  return reindexPoints(tracks.flatMap(trackToPoints));
}

export function reindexPoints(points: Point[]): Point[] {
  return [...points]
    .sort((a, b) => a.recordedAt - b.recordedAt)
    .map((p, i) => ({ ...p, id: i + 1 }));
}

function trackRowToTrack(row: TrackRow): Track[] {
  const coords = readLineStringCoords(row.path);
  const startedAt = Date.parse(row.started_at);
  const endedAt = Date.parse(row.ended_at);
  if (coords.length === 0) return [];

  const start = Number.isFinite(startedAt) ? startedAt : Date.now();
  const end = Number.isFinite(endedAt) ? endedAt : start;
  return [
    {
      id: row.id,
      startedAt: start,
      endedAt: end,
      path: { type: 'LineString', coordinates: coords },
    },
  ];
}

function trackToPoints(track: Track): Point[] {
  return track.path.coordinates.map(([lng, lat], i) => {
    const coords = track.path.coordinates;
    const ratio = coords.length <= 1 ? 0 : i / (coords.length - 1);
    return {
      id: i + 1,
      lat,
      lng,
      recordedAt: track.startedAt + (track.endedAt - track.startedAt) * ratio,
    };
  });
}

function readLineStringCoords(path: unknown): Coord[] {
  if (!path || typeof path !== 'object') return [];
  const coordinates = (path as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) return [];

  return coordinates.flatMap((coord): Coord[] => {
    if (!Array.isArray(coord)) return [];
    const lng = coord[0];
    const lat = coord[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return [];
    return [[lng, lat]];
  });
}
