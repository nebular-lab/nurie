// Web では SQLite を使わず Supabase から直接読む (閲覧専用)。
// Native 側にある書き込み API は呼ばれない想定で no-op。

import { supabase } from './supabase';

export type Point = {
  id: number;
  lat: number;
  lng: number;
  recordedAt: number;
};

export async function getAllPoints(): Promise<Point[]> {
  const { data, error } = await supabase
    .from('points')
    .select('lat, lng, recorded_at')
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  // id は Native では SQLite の AUTOINCREMENT 整数。Web は表示用なので連番で埋める。
  return data.map((row, i) => ({
    id: i + 1,
    lat: row.lat as number,
    lng: row.lng as number,
    recordedAt: row.recorded_at as number,
  }));
}

export async function insertPoint(): Promise<void> {
  throw new Error('insertPoint is not available on web');
}

export async function getUnsyncedPoints(): Promise<Point[]> {
  return [];
}

export async function markPointsSynced(): Promise<void> {}

export async function getTrackingEnabled(): Promise<boolean> {
  return false;
}

export async function setTrackingEnabled(): Promise<void> {}
