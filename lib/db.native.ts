import * as SQLite from 'expo-sqlite';

export type Point = {
  id: number;
  lat: number;
  lng: number;
  recordedAt: number;
};

type PointRow = {
  id: number;
  lat: number;
  lng: number;
  recorded_at_ms: number;
};

const DB_NAME = 'nurie.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    -- Supabase の tracks を正本にするため、SQLite は送信前の点だけを持つ。
    DROP TABLE IF EXISTS points;
    CREATE TABLE IF NOT EXISTS queued_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      recorded_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queued_points_recorded_at ON queued_points (recorded_at_ms);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- 古いビルドが残した不要テーブルを掃除する。
    DROP TABLE IF EXISTS osm_cache;
    DROP TABLE IF EXISTS task_events;
  `);

  return db;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

function rowToPoint(row: PointRow): Point {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    recordedAt: row.recorded_at_ms,
  };
}

export async function insertPoint(point: {
  lat: number;
  lng: number;
  recordedAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO queued_points (lat, lng, recorded_at_ms) VALUES (?, ?, ?)',
    point.lat,
    point.lng,
    Math.round(point.recordedAt),
  );
}

export async function getAllPoints(): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at_ms FROM queued_points ORDER BY recorded_at_ms ASC',
  );
  return rows.map(rowToPoint);
}

export async function getUnsyncedPoints(limit: number): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at_ms FROM queued_points ORDER BY recorded_at_ms ASC LIMIT ?',
    limit,
  );
  return rows.map(rowToPoint);
}

export async function deleteQueuedPoints(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM queued_points WHERE id IN (${placeholders})`,
    ...ids,
  );
}

const TRACKING_ENABLED_KEY = 'tracking_enabled';

export async function getTrackingEnabled(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    TRACKING_ENABLED_KEY,
  );
  // 未保存（初回起動）は停止中をデフォルトにする。
  return row?.value === '1';
}

export async function setTrackingEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    TRACKING_ENABLED_KEY,
    enabled ? '1' : '0',
  );
}
