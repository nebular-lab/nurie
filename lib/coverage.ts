// 厳密な歩行率計算。
// 1. 歩いた点列を 1 本の LineString として buffer(corridor) を作る
// 2. 各道路を細かくサンプリングし、サンプル点が corridor に入っていれば「その区間を歩いた」と判定
// 3. 歩いた区間長 ÷ 全道路長 = % を返す

import along from '@turf/along';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import { lineString, multiLineString } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import { COVERAGE_SAMPLE_SPACING_M } from './constants';
import type { Point } from './db';
import type { OsmRoad } from './osm';

export type RoadCoverage = {
  road: OsmRoad;
  totalM: number;
  walkedM: number;
  // 歩いた区間と未踏区間 (描画用)
  walkedSegments: [number, number][][];
  unwalkedSegments: [number, number][][];
};

export type CoverageResult = {
  totalM: number;
  walkedM: number;
  ratio: number; // 0..1
  roads: RoadCoverage[];
};

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
  corridor: Feature<Polygon | MultiPolygon>,
): RoadCoverage {
  const totalM = road.totalM;

  if (totalM < 1) {
    return {
      road,
      totalM,
      walkedM: 0,
      walkedSegments: [],
      unwalkedSegments: [road.coords],
    };
  }

  const line = lineString(road.coords);
  const spacing = COVERAGE_SAMPLE_SPACING_M;
  const numSamples = Math.max(2, Math.ceil(totalM / spacing) + 1);
  const interval = totalM / (numSamples - 1);
  const flags: boolean[] = [];
  const samples: [number, number][] = [];

  for (let i = 0; i < numSamples; i++) {
    const pt = along(line, (i * interval) / 1000, { units: 'kilometers' });
    const c = pt.geometry.coordinates as [number, number];
    samples.push(c);
    flags.push(booleanPointInPolygon(pt, corridor));
  }

  // 隣接するサンプル間の距離 (= interval) を「歩いた / 未踏」に振り分ける。
  // 両端のフラグが一致するならまるごと、ズレたら半分ずつ (描画用の run も中間点で切る)。
  let walkedM = 0;
  const walked: [number, number][][] = [];
  const unwalked: [number, number][][] = [];
  let curWalked = flags[0];
  let curRun: [number, number][] = [samples[0]];

  const pushRun = () => {
    if (curRun.length >= 2) {
      (curWalked ? walked : unwalked).push(curRun);
    }
    curRun = [];
  };

  for (let i = 1; i < samples.length; i++) {
    const prev = flags[i - 1];
    const f = flags[i];
    if (prev && f) walkedM += interval;
    else if (prev !== f) walkedM += interval / 2;

    if (f === curWalked) {
      curRun.push(samples[i]);
    } else {
      const mid: [number, number] = [
        (samples[i - 1][0] + samples[i][0]) / 2,
        (samples[i - 1][1] + samples[i][1]) / 2,
      ];
      curRun.push(mid);
      pushRun();
      curWalked = f;
      curRun = [mid, samples[i]];
    }
  }
  pushRun();

  return {
    road,
    totalM,
    walkedM,
    walkedSegments: walked,
    unwalkedSegments: unwalked,
  };
}

export function computeCoverage(
  points: Point[],
  roads: OsmRoad[],
  bufferM: number,
): CoverageResult {
  const corridor = buildTrailCorridor(points, bufferM);
  let totalM = 0;
  let walkedM = 0;
  const out: RoadCoverage[] = [];

  if (!corridor) {
    for (const road of roads) {
      totalM += road.totalM;
      out.push({
        road,
        totalM: road.totalM,
        walkedM: 0,
        walkedSegments: [],
        unwalkedSegments: [road.coords],
      });
    }
    return { totalM, walkedM: 0, ratio: 0, roads: out };
  }

  for (const road of roads) {
    const cov = classifyRoad(road, corridor);
    totalM += cov.totalM;
    walkedM += cov.walkedM;
    out.push(cov);
  }

  return {
    totalM,
    walkedM,
    ratio: totalM > 0 ? walkedM / totalM : 0,
    roads: out,
  };
}
