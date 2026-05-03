// 厳密な歩行率計算。
// 1. 歩いた点列を 1 本の LineString として buffer(corridor) を作る
// 2. 各道路を細かくサンプリングし、サンプル点が corridor に入っていれば「その区間を歩いた」と判定
// 3. 歩いた区間長 ÷ 全道路長 = % を返す

import along from '@turf/along';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import { lineString, multiLineString } from '@turf/helpers';
import length from '@turf/length';
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
  const line = lineString(road.coords);
  const totalKm = length(line, { units: 'kilometers' });
  const totalM = totalKm * 1000;

  if (totalM < 1) {
    return {
      road,
      totalM,
      walkedM: 0,
      walkedSegments: [],
      unwalkedSegments: [road.coords],
    };
  }

  const spacing = COVERAGE_SAMPLE_SPACING_M;
  const numSamples = Math.max(2, Math.ceil(totalM / spacing) + 1);
  const flags: boolean[] = [];
  const samples: [number, number][] = [];

  for (let i = 0; i < numSamples; i++) {
    const distM = (i / (numSamples - 1)) * totalM;
    const pt = along(line, distM / 1000, { units: 'kilometers' });
    const c = pt.geometry.coordinates as [number, number];
    samples.push(c);
    flags.push(booleanPointInPolygon(pt, corridor));
  }

  // 隣接するサンプル間の距離 (≒ spacing m) を「歩いた / 未踏」に振り分ける。
  // 区切りは「両端のフラグが一致するならそのまま、ズレたら半分ずつ」のシンプル判定。
  let walkedM = 0;
  const walked: [number, number][][] = [];
  const unwalked: [number, number][][] = [];
  let curWalked = false;
  let curRun: [number, number][] = [];

  const pushRun = () => {
    if (curRun.length >= 2) {
      (curWalked ? walked : unwalked).push(curRun);
    }
    curRun = [];
  };

  for (let i = 0; i < samples.length; i++) {
    const f = flags[i];
    if (i === 0) {
      curWalked = f;
      curRun = [samples[i]];
      continue;
    }
    if (f === curWalked) {
      curRun.push(samples[i]);
    } else {
      // 切り替え点。中間点で run を切る。
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

  for (const seg of walked) {
    walkedM += length(lineString(seg), { units: 'kilometers' }) * 1000;
  }

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
      const t = length(lineString(road.coords), { units: 'kilometers' }) * 1000;
      totalM += t;
      out.push({
        road,
        totalM: t,
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
