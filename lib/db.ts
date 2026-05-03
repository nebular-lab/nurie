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
    CREATE TABLE IF NOT EXISTS osm_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      home_lat REAL NOT NULL,
      home_lng REAL NOT NULL,
      radius_m INTEGER NOT NULL,
      fetched_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
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

export type OsmCacheRow = {
  homeLat: number;
  homeLng: number;
  radiusM: number;
  fetchedAt: number;
  payload: string;
};

export async function getOsmCache(): Promise<OsmCacheRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    home_lat: number;
    home_lng: number;
    radius_m: number;
    fetched_at: number;
    payload: string;
  }>('SELECT home_lat, home_lng, radius_m, fetched_at, payload FROM osm_cache WHERE id = 1');
  if (!row) return null;
  return {
    homeLat: row.home_lat,
    homeLng: row.home_lng,
    radiusM: row.radius_m,
    fetchedAt: row.fetched_at,
    payload: row.payload,
  };
}

export async function putOsmCache(entry: OsmCacheRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO osm_cache (id, home_lat, home_lng, radius_m, fetched_at, payload) VALUES (1, ?, ?, ?, ?, ?)',
    entry.homeLat,
    entry.homeLng,
    entry.radiusM,
    entry.fetchedAt,
    entry.payload,
  );
}
