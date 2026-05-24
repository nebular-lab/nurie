// Web では SQLite を使わず Supabase の tracks から直接読む (閲覧専用)。

import { fetchRemoteTrackPoints } from './remoteTracks';

export type Point = {
  id: number;
  lat: number;
  lng: number;
  recordedAt: number;
};

export async function getAllPoints(): Promise<Point[]> {
  return fetchRemoteTrackPoints();
}

export async function insertPoint(): Promise<void> {
  throw new Error('insertPoint is not available on web');
}

export async function getUnsyncedPoints(): Promise<Point[]> {
  return [];
}

export async function deleteQueuedPoints(): Promise<void> {}

export async function getTrackingEnabled(): Promise<boolean> {
  return false;
}

export async function setTrackingEnabled(): Promise<void> {}
