import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { insertPoint } from './db';

const TASK_NAME = 'nurie-location-tracking';

type LocationTaskData = {
  locations: Location.LocationObject[];
};

TaskManager.defineTask<LocationTaskData>(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[task] error', error);
    return;
  }
  if (!data) return;
  for (const loc of data.locations) {
    try {
      await insertPoint({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        recordedAt: loc.timestamp,
      });
    } catch (e) {
      console.warn('[task] insert failed', e);
    }
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
