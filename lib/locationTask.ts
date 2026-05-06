import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DeviceEventEmitter } from 'react-native';

import { AREA_RADIUS_M, HOME } from './constants';
import { getRecentPoints, insertPoint } from './db';
import { haversineMeters } from './geo';

const TASK_NAME = 'nurie-location-tracking';
const MIN_DISTANCE_M = 8;

// foreground 中に新しい点が DB に書かれたことを React 側へ通知する。
// アプリが kill された状態でタスクが起きた場合は listener が居ないので無害。
export const POINT_ADDED_EVENT = 'nurie:point-added';

type LocationTaskData = {
  locations: Location.LocationObject[];
};

let lastSaved: { lat: number; lng: number } | null = null;

async function ensureLastSavedLoaded() {
  if (lastSaved !== null) return;
  const recent = await getRecentPoints(1);
  if (recent.length > 0) {
    lastSaved = { lat: recent[0].lat, lng: recent[0].lng };
  }
}

TaskManager.defineTask<LocationTaskData>(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[task] error', error);
    return;
  }
  if (!data) return;

  await ensureLastSavedLoaded();

  let inserted = 0;
  for (const loc of data.locations) {
    const candidate = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
    };
    if (haversineMeters(HOME, candidate) > AREA_RADIUS_M) {
      continue;
    }
    if (lastSaved && haversineMeters(lastSaved, candidate) < MIN_DISTANCE_M) {
      continue;
    }
    try {
      await insertPoint({
        lat: candidate.lat,
        lng: candidate.lng,
        recordedAt: loc.timestamp,
      });
      lastSaved = candidate;
      inserted++;
    } catch (e) {
      console.warn('[task] insert failed', e);
    }
  }

  if (inserted > 0) {
    DeviceEventEmitter.emit(POINT_ADDED_EVENT);
  }
});

export async function startTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 10,
    showsBackgroundLocationIndicator: false,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: true,
  });
}
