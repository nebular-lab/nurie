// Web は閲覧専用なので位置情報の記録は走らせない。
// 同名の hook を no-op で公開し、UI 側からは Native と同じ shape で扱えるようにする。

export type LocationTrackingState =
  | { status: 'starting'; isEnabled: false }
  | { status: 'tracking'; isEnabled: true }
  | { status: 'paused'; isEnabled: false }
  | { status: 'error'; isEnabled: false; message: string };

export type LocationTrackingControls = {
  state: LocationTrackingState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function useLocationTracking(): LocationTrackingControls {
  return {
    state: { status: 'paused', isEnabled: false },
    start: async () => {},
    stop: async () => {},
  };
}
