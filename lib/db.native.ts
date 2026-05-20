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
      recorded_at INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
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

  // 既存ビルドからの DB に synced カラムが無ければ後付けで足す。
  // SQLite には ADD COLUMN IF NOT EXISTS が無いので PRAGMA で確認する。
  const cols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info('points')",
  );
  if (!cols.some((c) => c.name === 'synced')) {
    await db.execAsync(
      'ALTER TABLE points ADD COLUMN synced INTEGER NOT NULL DEFAULT 0',
    );
  }
  // 未同期点を毎回フルスキャンしないためのインデックス。
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_points_synced ON points (synced)',
  );

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

export async function getUnsyncedPoints(limit: number): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at FROM points WHERE synced = 0 ORDER BY recorded_at ASC LIMIT ?',
    limit,
  );
  return rows.map(rowToPoint);
}

export async function markPointsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE points SET synced = 1 WHERE id IN (${placeholders})`,
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
