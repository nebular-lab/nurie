export type Coord = [number, number];

export type TrackPath = {
  type: 'LineString';
  coordinates: Coord[];
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

export type RemoteTrackRow = {
  id: string;
  started_at: string;
  ended_at: string;
  path: unknown;
};
