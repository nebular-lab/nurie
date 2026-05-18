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
  recorded_at: number;
};

const DB_NAME = 'nurie.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_points_recorded_at ON points (recorded_at);
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
    recordedAt: row.recorded_at,
  };
}

export async function insertPoint(point: {
  lat: number;
  lng: number;
  recordedAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO points (lat, lng, recorded_at) VALUES (?, ?, ?)',
    point.lat,
    point.lng,
    point.recordedAt,
  );
}

export async function getAllPoints(): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at FROM points ORDER BY recorded_at ASC',
  );
  return rows.map(rowToPoint);
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
