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
    -- 古いビルドが残した不要テーブルを掃除する (現在は静的データを直接使うのでキャッシュは不要)。
    DROP TABLE IF EXISTS osm_cache;
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

export async function getRecentPoints(limit: number): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at FROM points ORDER BY recorded_at DESC LIMIT ?',
    limit,
  );
  return rows.map(rowToPoint);
}

export async function getAllPoints(): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PointRow>(
    'SELECT id, lat, lng, recorded_at FROM points ORDER BY recorded_at ASC',
  );
  return rows.map(rowToPoint);
}
