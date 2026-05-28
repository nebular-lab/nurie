import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DeviceEventEmitter } from 'react-native';

import { AREA_RADIUS_M, HOME } from '@/shared/constants/appConfig';
import { haversineMeters } from '@/shared/utils/geo';

import { insertPoint } from './queuedPointStore';
import { POINTS_CHANGED_EVENT } from '../utils/pointEvents';

const TASK_NAME = 'nurie-location-tracking';

// foreground 中に新しい点が DB に書かれたことを React 側へ通知する。
// アプリが kill された状態でタスクが起きた場合は listener が居ないので無害。
export const POINT_ADDED_EVENT = POINTS_CHANGED_EVENT;

type LocationTaskData = {
  locations: Location.LocationObject[];
};

TaskManager.defineTask<LocationTaskData>(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[task] error', error);
    return;
  }
  if (!data) return;

  let inserted = 0;
  for (const loc of data.locations) {
    const candidate = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
    };
    if (haversineMeters(HOME, candidate) > AREA_RADIUS_M) {
      continue;
    }
    try {
      await insertPoint({
        lat: candidate.lat,
        lng: candidate.lng,
        recordedAt: loc.timestamp,
      });
      inserted++;
    } catch (e) {
      console.warn('[task] insert failed', e);
    }
  }

  if (inserted > 0) {
    DeviceEventEmitter.emit(POINT_ADDED_EVENT);
  }
});

export async function stopTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

export async function startTracking() {
  // 既に登録済みの場合でも、ビルドをまたいでオプションを確実に反映させるために
  // 一度停止してから再登録する。startLocationUpdatesAsync の登録は再インストールを
  // またいで残るため、早期 return すると古いオプションのまま動き続ける。
  await stopTracking();
  // iOS 16.4 以降、startUpdatingLocation + startMonitoringSignificantLocationChanges
  // の併用 (expo-location は内部で両方呼ぶ) + distanceFilter 設定 +
  // showsBackgroundLocationIndicator: false の 3 条件が揃うと、画面ロック数秒で
  // standard updates が OS によりサスペンドされる。3 条件のうちどれかを崩せば
  // 回避できるので、青バー表示 (= showsBackgroundLocationIndicator: true) で
  // 1 条件を外す。これにより distanceInterval を残しても suspend されない。
  // 参考: https://developer.apple.com/forums/thread/726945
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Highest,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    distanceInterval: 10,
  });
}
