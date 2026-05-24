// Web は閲覧専用で位置情報の記録はしない。Native と同じ shape の export を no-op で揃える。
import { POINTS_CHANGED_EVENT } from './pointEvents';

export const POINT_ADDED_EVENT = POINTS_CHANGED_EVENT;

export async function startTracking(): Promise<void> {}
export async function stopTracking(): Promise<void> {}
