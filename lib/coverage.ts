// 厳密な歩行率計算。
// 1. 歩いた点列を 1 本の LineString として buffer(corridor) を作る (今日 / 過去で 2 つ)
// 2. 各道路を細かくサンプリングし、サンプル点が corridor に入っていれば「歩いた」と判定
// 3. 今日の corridor が優先 (今日歩いたなら past 扱いしない)
// 4. 歩いた区間長 ÷ 全道路長 = % を返す

import along from '@turf/along';
import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import { lineString, multiLineString } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import { COVERAGE_SAMPLE_SPACING_M } from './constants';
import type { Point } from './db';
import type { Bbox, WalkableRoad } from './walkableRoads';

// バックグラウンド休止後の飛びなどで連続性が崩れた区間で線を分割する閾値。
const SEGMENT_GAP_MS = 15 * 60 * 1000;

const COVERAGE_STATUS = {
  UNWALKED: 0,
  PAST: 1,
  TODAY: 2,
} as const;
type CoverageStatus = (typeof COVERAGE_STATUS)[keyof typeof COVERAGE_STATUS];

type Coord = [number, number];
type Corridor = Feature<Polygon | MultiPolygon>;

export type RoadCoverage = {
  road: WalkableRoad;
  totalM: number;
  walkedTodayM: number;
  walkedPastM: number;
  // 描画用 (status ごとに線を切り出す)
  walkedTodaySegments: Coord[][];
  walkedPastSegments: Coord[][];
  unwalkedSegments: Coord[][];
};

export type CoverageResult = {
  totalM: number;
  walkedM: number; // 今日 + 過去
  walkedTodayM: number;
  walkedPastM: number;
  ratio: number; // 0..1
  roads: RoadCoverage[];
};

export function computeCoverage(
  points: Point[],
  roads: WalkableRoad[],
  bufferM: number,
): CoverageResult {
  const today = formatDateKey(Date.now());
  const todayPoints = points.filter((p) => formatDateKey(p.recordedAt) === today);
  const pastPoints = points.filter((p) => formatDateKey(p.recordedAt) !== today);

  const todayCorridor = buildTrailCorridor(todayPoints, bufferM);
  const pastCorridor = buildTrailCorridor(pastPoints, bufferM);

  if (!todayCorridor && !pastCorridor) {
    return buildAllUnwalkedResult(roads);
  }

  // 2 つのコリドーの bbox を合わせて、それと交わらない道路はサンプリングを丸ごと省略する。
  const combinedBbox = unionBboxes(
    todayCorridor ? (bbox(todayCorridor) as Bbox) : null,
    pastCorridor ? (bbox(pastCorridor) as Bbox) : null,
  );

  let totalM = 0;
  let walkedTodayM = 0;
  let walkedPastM = 0;
  const roadCoverages: RoadCoverage[] = [];
  for (const road of roads) {
    const cov =
      combinedBbox && bboxesIntersect(road.bbox, combinedBbox)
        ? classifyRoad(road, todayCorridor, pastCorridor)
        : buildUnwalkedRoadCoverage(road);
    totalM += cov.totalM;
    walkedTodayM += cov.walkedTodayM;
    walkedPastM += cov.walkedPastM;
    roadCoverages.push(cov);
  }

  const walkedM = walkedTodayM + walkedPastM;
  return {
    totalM,
    walkedM,
    walkedTodayM,
    walkedPastM,
    ratio: totalM > 0 ? walkedM / totalM : 0,
    roads: roadCoverages,
  };
}

// 半径バンドごとに「最短距離が R 以内の道路」だけを集計する。
// バンドはネスト関係なので、より小さい R の道路はより大きい R の合計にも含まれる。
export function aggregateCoverageByBands(
  result: CoverageResult,
  bandsM: readonly number[],
): { totalM: number; walkedM: number }[] {
  const totals = bandsM.map(() => ({ totalM: 0, walkedM: 0 }));
  for (const rc of result.roads) {
    const distance = rc.road.minDistFromHome;
    const walked = rc.walkedTodayM + rc.walkedPastM;
    for (let i = 0; i < bandsM.length; i++) {
      if (distance <= bandsM[i]) {
        totals[i].totalM += rc.totalM;
        totals[i].walkedM += walked;
      }
    }
  }
  return totals;
}

function formatDateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildTrailCorridor(points: Point[], bufferM: number): Corridor | null {
  if (points.length === 0) return null;

  if (points.length === 1) {
    // 1 点だけならその周囲を円バッファに
    const p = points[0];
    return buffer(
      lineString([
        [p.lng, p.lat],
        [p.lng + 1e-7, p.lat + 1e-7],
      ]),
      bufferM,
      { units: 'meters' },
    ) as Corridor;
  }

  const lines = splitPointsIntoSegments(points);
  if (lines.length === 0) return null;
  return buffer(multiLineString(lines), bufferM, { units: 'meters' }) as Corridor;
}

function splitPointsIntoSegments(points: Point[]): Coord[][] {
  const lines: Coord[][] = [];
  let current: Coord[] = [[points[0].lng, points[0].lat]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (p.recordedAt - prev.recordedAt > SEGMENT_GAP_MS) {
      if (current.length >= 2) lines.push(current);
      current = [[p.lng, p.lat]];
    } else {
      current.push([p.lng, p.lat]);
    }
  }
  if (current.length >= 2) lines.push(current);
  return lines;
}

function classifyRoad(
  road: WalkableRoad,
  todayCorridor: Corridor | null,
  pastCorridor: Corridor | null,
): RoadCoverage {
  if (road.totalM < 1) return buildUnwalkedRoadCoverage(road);

  const { samples, statuses, interval } = sampleRoadStatuses(
    road,
    todayCorridor,
    pastCorridor,
  );
  const distances = computeWalkedDistances(statuses, interval);
  const segments = splitIntoStatusSegments(samples, statuses);

  return {
    road,
    totalM: road.totalM,
    walkedTodayM: distances.walkedTodayM,
    walkedPastM: distances.walkedPastM,
    walkedTodaySegments: segments.todaySegments,
    walkedPastSegments: segments.pastSegments,
    unwalkedSegments: segments.unwalkedSegments,
  };
}

function sampleRoadStatuses(
  road: WalkableRoad,
  todayCorridor: Corridor | null,
  pastCorridor: Corridor | null,
): {
  samples: Coord[];
  statuses: CoverageStatus[];
  interval: number;
} {
  const line = lineString(road.coords);
  const numSamples = Math.max(2, Math.ceil(road.totalM / COVERAGE_SAMPLE_SPACING_M) + 1);
  const interval = road.totalM / (numSamples - 1);
  const samples: Coord[] = [];
  const statuses: CoverageStatus[] = [];

  for (let i = 0; i < numSamples; i++) {
    const pt = along(line, (i * interval) / 1000, { units: 'kilometers' });
    samples.push(pt.geometry.coordinates as Coord);

    const inToday =
      todayCorridor !== null && booleanPointInPolygon(pt, todayCorridor);
    const inPast =
      !inToday && pastCorridor !== null && booleanPointInPolygon(pt, pastCorridor);

    statuses.push(
      inToday
        ? COVERAGE_STATUS.TODAY
        : inPast
          ? COVERAGE_STATUS.PAST
          : COVERAGE_STATUS.UNWALKED,
    );
  }
  return { samples, statuses, interval };
}

// 区間 (i-1 → i) の距離 interval を、両端のステータスから歩行距離に振り分ける。
// 同じステータスならまるごと、ズレたら半分ずつ。
function computeWalkedDistances(
  statuses: CoverageStatus[],
  interval: number,
): { walkedTodayM: number; walkedPastM: number } {
  let walkedTodayM = 0;
  let walkedPastM = 0;
  for (let i = 1; i < statuses.length; i++) {
    const prev = statuses[i - 1];
    const cur = statuses[i];
    if (prev === cur) {
      if (prev === COVERAGE_STATUS.TODAY) walkedTodayM += interval;
      else if (prev === COVERAGE_STATUS.PAST) walkedPastM += interval;
    } else {
      const half = interval / 2;
      if (prev === COVERAGE_STATUS.TODAY) walkedTodayM += half;
      else if (prev === COVERAGE_STATUS.PAST) walkedPastM += half;
      if (cur === COVERAGE_STATUS.TODAY) walkedTodayM += half;
      else if (cur === COVERAGE_STATUS.PAST) walkedPastM += half;
    }
  }
  return { walkedTodayM, walkedPastM };
}

function splitIntoStatusSegments(
  samples: Coord[],
  statuses: CoverageStatus[],
): {
  todaySegments: Coord[][];
  pastSegments: Coord[][];
  unwalkedSegments: Coord[][];
} {
  const todaySegments: Coord[][] = [];
  const pastSegments: Coord[][] = [];
  const unwalkedSegments: Coord[][] = [];
  const bucketFor = (status: CoverageStatus) =>
    status === COVERAGE_STATUS.TODAY
      ? todaySegments
      : status === COVERAGE_STATUS.PAST
        ? pastSegments
        : unwalkedSegments;

  let currentStatus = statuses[0];
  let currentRun: Coord[] = [samples[0]];
  const flushRun = () => {
    if (currentRun.length >= 2) bucketFor(currentStatus).push(currentRun);
    currentRun = [];
  };

  for (let i = 1; i < samples.length; i++) {
    const status = statuses[i];
    if (status === currentStatus) {
      currentRun.push(samples[i]);
      continue;
    }
    // ステータスが切り替わった点は、両セグメントが共有する中点までで分ける。
    const midpoint: Coord = [
      (samples[i - 1][0] + samples[i][0]) / 2,
      (samples[i - 1][1] + samples[i][1]) / 2,
    ];
    currentRun.push(midpoint);
    flushRun();
    currentStatus = status;
    currentRun = [midpoint, samples[i]];
  }
  flushRun();
  return { todaySegments, pastSegments, unwalkedSegments };
}

function buildAllUnwalkedResult(roads: WalkableRoad[]): CoverageResult {
  let totalM = 0;
  const roadCoverages: RoadCoverage[] = [];
  for (const road of roads) {
    totalM += road.totalM;
    roadCoverages.push(buildUnwalkedRoadCoverage(road));
  }
  return {
    totalM,
    walkedM: 0,
    walkedTodayM: 0,
    walkedPastM: 0,
    ratio: 0,
    roads: roadCoverages,
  };
}

function buildUnwalkedRoadCoverage(road: WalkableRoad): RoadCoverage {
  return {
    road,
    totalM: road.totalM,
    walkedTodayM: 0,
    walkedPastM: 0,
    walkedTodaySegments: [],
    walkedPastSegments: [],
    unwalkedSegments: [road.coords],
  };
}

function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function unionBboxes(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}
