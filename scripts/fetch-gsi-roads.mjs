// GSI ベクトルタイル (experimental_bvmap) から自宅周辺の道路中心線を取得して
// lib/osmData.json と同じ形式で書き出す。
// 実行: node scripts/fetch-gsi-roads.mjs
//
// 流れ:
//  1. HOME ± RADIUS_M を覆うタイル範囲を計算 (zoom Z)
//  2. 各タイルを GSI から PBF で取得
//  3. road レイヤーから「道路中心線」系の ftCode のみ取り出す
//  4. feature.id で重複除去 (タイル境界で切られた同一 way をまとめる)
//  5. HOME から RADIUS_M 以内のものに絞り込む
//  6. rdCtg を highway 値にマッピング
//  7. RawOsmRoad 互換 ({id, highway, coords}) で書き出す

import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { writeFileSync, statSync } from 'fs';

const HOME = { lat: 35.890076, lng: 139.469982 };
const RADIUS_M = 5000;
const Z = 15;
const ENDPOINT = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap';
const USER_AGENT = 'nurie-static-data-generator/1.0 (personal project; daisuke)';

// GSI ベクトルタイルの road レイヤー観察結果:
//  z=15 では ftCode 27xx 系のみ存在 → これが道路中心線 (1 道路 1 ライン)
//  z=16 では 22xx と 27xx 両方存在 → 22xx は道路縁・詳細ジオメトリで除外したい側
// 27xx 系 (路線中心線) のみ採用する。
//  2701: 道路 (普通), 2703: 橋, 2704: トンネル
//  2711: 軽車道相当
//  2721: 庭園路, 2731: その他 (大半は不要、ただし整合性のため拾う)
const ROAD_FTCODES = new Set([2701, 2703, 2704, 2711, 2721, 2731]);

// rdCtg (道路区分) → highway。27xx 系には rdCtg が設定されているので使う。
//  1: 高速自動車国道 / 自動車専用道路 → primary 扱い
//  2: 国道 → primary
//  3: 都道府県道 → secondary
//  4: 市区町村道 → residential
//  5: その他 → unclassified
//  0 / undefined: 不明 → unclassified
const RDCTG_TO_HIGHWAY = {
  1: 'primary',
  2: 'primary',
  3: 'secondary',
  4: 'residential',
  5: 'unclassified',
};
function classifyHighway(ftCode, rdCtg) {
  if (ftCode === 2711) return 'service'; // 軽車道
  if (ftCode === 2721) return 'track'; // 庭園路
  if (ftCode === 2731) return 'unclassified'; // その他
  return RDCTG_TO_HIGHWAY[rdCtg] ?? 'unclassified';
}

function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 *
      Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function downloadTile(z, x, y) {
  const url = `${ENDPOINT}/${z}/${x}/${y}.pbf`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`[gsi] tile ${z}/${x}/${y}: HTTP ${res.status}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  return new VectorTile(new Pbf(buf));
}

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIdx = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx]);
      }
    }),
  );
  return results;
}

function roundCoord([lng, lat]) {
  // 6 桁 ≈ 11cm 精度。歩行率計算では十分すぎるほど。
  return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

async function main() {
  const dLat = RADIUS_M / 111000;
  const dLng = RADIUS_M / (111000 * Math.cos((HOME.lat * Math.PI) / 180));
  const [minX, maxY] = lngLatToTile(HOME.lng - dLng, HOME.lat - dLat, Z);
  const [maxX, minY] = lngLatToTile(HOME.lng + dLng, HOME.lat + dLat, Z);
  const totalTiles = (maxX - minX + 1) * (maxY - minY + 1);
  console.error(
    `[gsi] downloading ${totalTiles} tiles at z=${Z}: x=${minX}..${maxX}, y=${minY}..${maxY}`,
  );

  const tileCoords = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) tileCoords.push([x, y]);
  }
  let downloaded = 0;
  const tiles = await runWithConcurrency(tileCoords, 6, async ([x, y]) => {
    const tile = await downloadTile(Z, x, y);
    downloaded++;
    if (downloaded % 30 === 0) {
      console.error(`[gsi] ${downloaded}/${totalTiles}`);
    }
    return [x, y, tile];
  });

  // feature.id で重複除去しつつ収集
  const byId = new Map();
  let idLessCount = 0;
  let totalFeatures = 0;
  let acceptedFeatures = 0;
  const ftCodeAcceptedCounts = {};
  const ftCodeRejectedCounts = {};

  for (const [x, y, tile] of tiles) {
    if (!tile) continue;
    const layer = tile.layers.road;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      totalFeatures++;
      const ftCode = feature.properties.ftCode;
      if (!ROAD_FTCODES.has(ftCode)) {
        ftCodeRejectedCounts[ftCode] = (ftCodeRejectedCounts[ftCode] ?? 0) + 1;
        continue;
      }
      ftCodeAcceptedCounts[ftCode] = (ftCodeAcceptedCounts[ftCode] ?? 0) + 1;
      acceptedFeatures++;

      const geo = feature.toGeoJSON(x, y, Z);
      const lineStrings =
        geo.geometry.type === 'LineString'
          ? [geo.geometry.coordinates]
          : geo.geometry.type === 'MultiLineString'
          ? geo.geometry.coordinates
          : [];

      const fid = feature.id;
      for (let j = 0; j < lineStrings.length; j++) {
        const coords = lineStrings[j].map(roundCoord);
        if (coords.length < 2) continue;
        // id がある場合はタイル間で同じ feature → 1 件にまとめる (どのタイルの分でも OK)
        // id が無い場合はタイル間で重複を除去できないので、タイルごとに別 feature 扱い
        const key = fid !== undefined ? `id:${fid}:${j}` : `xy:${x}_${y}_${i}_${j}`;
        if (byId.has(key)) continue;
        if (fid === undefined) idLessCount++;
        byId.set(key, {
          id: typeof fid === 'number' ? fid : key,
          ftCode,
          rdCtg: feature.properties.rdCtg ?? 0,
          coords,
        });
      }
    }
  }

  console.error(`[gsi] road layer features total: ${totalFeatures}`);
  console.error(`[gsi] accepted by ftCode filter: ${acceptedFeatures}`);
  console.error(`[gsi] dedup'd unique entries: ${byId.size}`);
  console.error(`[gsi] features without feature.id: ${idLessCount}`);
  console.error('[gsi] accepted ftCode breakdown:', ftCodeAcceptedCounts);
  console.error('[gsi] rejected ftCode breakdown:', ftCodeRejectedCounts);

  // HOME から RADIUS_M 以内に少しでも触れるものに絞る
  const filtered = [...byId.values()].filter((r) =>
    r.coords.some(([lng, lat]) => haversine(HOME, { lat, lng }) <= RADIUS_M),
  );
  console.error(`[gsi] after ${RADIUS_M}m filter: ${filtered.length}`);

  // 同じ ftCode で端点が一致する features を 1 本につなげる。
  // タイル境界での clipping や、交差点ごとの細分割を統合してポリライン数を減らす。
  const merged = mergeChains(filtered);
  console.error(`[gsi] after merge: ${merged.length}`);

  // RawOsmRoad 互換に整形 + primary / unclassified のみ採用
  // (secondary = 自動車専用道路、service = 軽車道、track = 庭園路 は散歩アプリでは除外)
  const KEEP = new Set(['primary', 'unclassified']);
  const out = merged
    .map((r, i) => ({
      id: typeof r.id === 'number' ? r.id : i,
      highway: classifyHighway(r.ftCode, r.rdCtg),
      coords: r.coords,
    }))
    .filter((r) => KEEP.has(r.highway));

  // highway 別の集計
  const highwayCounts = {};
  for (const o of out) {
    highwayCounts[o.highway] = (highwayCounts[o.highway] ?? 0) + 1;
  }
  console.error('[gsi] highway breakdown:', highwayCounts);

  writeFileSync('lib/osmData.json', JSON.stringify(out));
  const stats = statSync('lib/osmData.json');
  console.error(
    `[gsi] wrote lib/osmData.json (${(stats.size / 1024).toFixed(0)} KB, ${out.length} roads)`,
  );
}

function mergeChains(roads) {
  const N = roads.length;
  const visited = new Array(N).fill(false);
  const key = (c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;

  // 端点 → そこに接する features の一覧
  const endpointMap = new Map();
  for (let i = 0; i < N; i++) {
    const sk = key(roads[i].coords[0]);
    const ek = key(roads[i].coords[roads[i].coords.length - 1]);
    if (!endpointMap.has(sk)) endpointMap.set(sk, []);
    endpointMap.get(sk).push({ idx: i, atEnd: false });
    if (!endpointMap.has(ek)) endpointMap.set(ek, []);
    endpointMap.get(ek).push({ idx: i, atEnd: true });
  }

  // currentIdx の指定 endpoint から「同じ ftCode で未訪問」の継続を 1 つ探す
  function findContinuation(currentIdx, atKey) {
    const cands = endpointMap.get(atKey) ?? [];
    for (const c of cands) {
      if (c.idx === currentIdx || visited[c.idx]) continue;
      if (roads[c.idx].ftCode !== roads[currentIdx].ftCode) continue;
      return c;
    }
    return null;
  }

  const merged = [];
  for (let i = 0; i < N; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    let coords = roads[i].coords.slice();

    // 前方に伸ばす
    let curIdx = i;
    while (true) {
      const lastKey = key(coords[coords.length - 1]);
      const next = findContinuation(curIdx, lastKey);
      if (!next) break;
      visited[next.idx] = true;
      const nc = roads[next.idx].coords;
      coords = next.atEnd
        ? coords.concat([...nc].reverse().slice(1))
        : coords.concat(nc.slice(1));
      curIdx = next.idx;
    }

    // 後方に伸ばす
    curIdx = i;
    while (true) {
      const firstKey = key(coords[0]);
      const prev = findContinuation(curIdx, firstKey);
      if (!prev) break;
      visited[prev.idx] = true;
      const pc = roads[prev.idx].coords;
      coords = prev.atEnd
        ? pc.slice(0, -1).concat(coords)
        : [...pc].reverse().slice(0, -1).concat(coords);
      curIdx = prev.idx;
    }

    merged.push({
      id: roads[i].id,
      ftCode: roads[i].ftCode,
      rdCtg: roads[i].rdCtg,
      coords,
    });
  }
  return merged;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
