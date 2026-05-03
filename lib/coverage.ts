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
import type { Bbox, OsmRoad } from './osm';

// 0 = 未踏, 1 = 過去のいずれかの日に歩いた, 2 = 今日歩いた
type Status = 0 | 1 | 2;

export type RoadCoverage = {
  road: OsmRoad;
  totalM: number;
  walkedTodayM: number;
  walkedPastM: number;
  // 描画用 (status ごとに線を切り出す)
  walkedTodaySegments: [number, number][][];
  walkedPastSegments: [number, number][][];
  unwalkedSegments: [number, number][][];
};

export type CoverageResult = {
  totalM: number;
  walkedM: number; // 今日 + 過去
  walkedTodayM: number;
  walkedPastM: number;
  ratio: number; // 0..1
  roads: RoadCoverage[];
};

function dateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildTrailCorridor(
  points: Point[],
  bufferM: number,
): Feature<Polygon | MultiPolygon> | null {
  if (points.length < 2) {
    if (points.length === 0) return null;
    // 1 点だけならその周囲を円バッファに
    const p = points[0];
    return buffer(
      lineString([
        [p.lng, p.lat],
        [p.lng + 1e-7, p.lat + 1e-7],
      ]),
      bufferM,
      { units: 'meters' },
    ) as Feature<Polygon | MultiPolygon>;
  }

  // 連続性が大きく崩れた区間で線を分割 (バックグラウンド休止後の飛び など)
  const SEGMENT_GAP_MS = 15 * 60 * 1000;
  const lines: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0) {
      cur = [[p.lng, p.lat]];
      continue;
    }
    const prev = points[i - 1];
    if (p.recordedAt - prev.recordedAt > SEGMENT_GAP_MS) {
      if (cur.length >= 2) lines.push(cur);
      cur = [[p.lng, p.lat]];
    } else {
      cur.push([p.lng, p.lat]);
    }
  }
  if (cur.length >= 2) lines.push(cur);
  if (lines.length === 0) return null;

  const trail = multiLineString(lines);
  return buffer(trail, bufferM, { units: 'meters' }) as Feature<
    Polygon | MultiPolygon
  >;
}

function classifyRoad(
  road: OsmRoad,
  todayCorridor: Feature<Polygon | MultiPolygon> | null,
  pastCorridor: Feature<Polygon | MultiPolygon> | null,
): RoadCoverage {
  const totalM = road.totalM;
  if (totalM < 1) return unwalkedRoadCoverage(road);

  const line = lineString(road.coords);
  const spacing = COVERAGE_SAMPLE_SPACING_M;
  const numSamples = Math.max(2, Math.ceil(totalM / spacing) + 1);
  const interval = totalM / (numSamples - 1);
  const statuses: Status[] = [];
  const samples: [number, number][] = [];

  for (let i = 0; i < numSamples; i++) {
    const pt = along(line, (i * interval) / 1000, { units: 'kilometers' });
    const c = pt.geometry.coordinates as [number, number];
    samples.push(c);
    const inToday = todayCorridor
      ? booleanPointInPolygon(pt, todayCorridor)
      : false;
    const inPast =
      !inToday && pastCorridor ? booleanPointInPolygon(pt, pastCorridor) : false;
    statuses.push(inToday ? 2 : inPast ? 1 : 0);
  }

  let walkedTodayM = 0;
  let walkedPastM = 0;
  const today: [number, number][][] = [];
  const past: [number, number][][] = [];
  const unwalked: [number, number][][] = [];
  let curStatus = statuses[0];
  let curRun: [number, number][] = [samples[0]];

  const pushRun = () => {
    if (curRun.length >= 2) {
      (curStatus === 2 ? today : curStatus === 1 ? past : unwalked).push(curRun);
    }
    curRun = [];
  };

  for (let i = 1; i < samples.length; i++) {
    const prev = statuses[i - 1];
    const cur = statuses[i];

    // 区間 (i-1 → i) の距離 interval を、両端のステータスから歩行距離に振り分ける。
    // 同じステータスならまるごと、ズレたら半分ずつ。
    if (prev === cur) {
      if (prev === 2) walkedTodayM += interval;
      else if (prev === 1) walkedPastM += interval;
    } else {
      if (prev === 2) walkedTodayM += interval / 2;
      else if (prev === 1) walkedPastM += interval / 2;
      if (cur === 2) walkedTodayM += interval / 2;
      else if (cur === 1) walkedPastM += interval / 2;
    }

    if (cur === curStatus) {
      curRun.push(samples[i]);
    } else {
      const mid: [number, number] = [
        (samples[i - 1][0] + samples[i][0]) / 2,
        (samples[i - 1][1] + samples[i][1]) / 2,
      ];
      curRun.push(mid);
      pushRun();
      curStatus = cur;
      curRun = [mid, samples[i]];
    }
  }
  pushRun();

  return {
    road,
    totalM,
    walkedTodayM,
    walkedPastM,
    walkedTodaySegments: today,
    walkedPastSegments: past,
    unwalkedSegments: unwalked,
  };
}

function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function unwalkedRoadCoverage(road: OsmRoad): RoadCoverage {
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

export function computeCoverage(
  points: Point[],
  roads: OsmRoad[],
  bufferM: number,
): CoverageResult {
  const today = dateKey(Date.now());
  const todayPoints = points.filter((p) => dateKey(p.recordedAt) === today);
  const pastPoints = points.filter((p) => dateKey(p.recordedAt) !== today);

  const todayCorridor = buildTrailCorridor(todayPoints, bufferM);
  const pastCorridor = buildTrailCorridor(pastPoints, bufferM);

  let totalM = 0;
  let walkedTodayM = 0;
  let walkedPastM = 0;
  const out: RoadCoverage[] = [];

  if (!todayCorridor && !pastCorridor) {
    for (const road of roads) {
      totalM += road.totalM;
      out.push(unwalkedRoadCoverage(road));
    }
    return {
      totalM,
      walkedM: 0,
      walkedTodayM: 0,
      walkedPastM: 0,
      ratio: 0,
      roads: out,
    };
  }

  // 2 つのコリドーの bbox を合わせて、それと交わらない道路はサンプリングを丸ごと省略する。
  const combinedBbox = unionBboxes(
    todayCorridor ? (bbox(todayCorridor) as Bbox) : null,
    pastCorridor ? (bbox(pastCorridor) as Bbox) : null,
  );

  for (const road of roads) {
    const cov =
      combinedBbox && bboxesIntersect(road.bbox, combinedBbox)
        ? classifyRoad(road, todayCorridor, pastCorridor)
        : unwalkedRoadCoverage(road);
    totalM += cov.totalM;
    walkedTodayM += cov.walkedTodayM;
    walkedPastM += cov.walkedPastM;
    out.push(cov);
  }

  const walkedM = walkedTodayM + walkedPastM;
  return {
    totalM,
    walkedM,
    walkedTodayM,
    walkedPastM,
    ratio: totalM > 0 ? walkedM / totalM : 0,
    roads: out,
  };
}
