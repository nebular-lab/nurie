import { supabase } from '@/shared/effect/supabase/supabase';

import type { Point } from './queuedPointStore';
import type { RemoteTrackRow, Track } from '../types';
import { trackRowsToTracks, tracksToPoints } from '../utils/trackTransform';

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

  return trackRowsToTracks(data as RemoteTrackRow[]);
}
