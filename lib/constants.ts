// 自宅座標と達成率エリアの設定。
// 自宅で使う場合は HOME を書き換えて再ビルドする。
// HOME と AREA_RADIUS_M を変更したら lib/osmData.json も再生成すること
// (現在の値は scripts で Overpass から取得したスナップショット)。
export const HOME = {
  lat: 35.890076,
  lng: 139.469982,
};

export const AREA_RADIUS_M = 3000; // 自宅から何 m を達成率対象とするか
export const BUFFER_M = 8; // 道路から何 m 以内に GPS 点があれば「歩いた」扱いとするか
export const COVERAGE_SAMPLE_SPACING_M = 2; // 道路サンプリング間隔 (細かいほど精度↑、計算↓)
// 片端が他の道路と繋がっていない短い道 (袋小路・私道枝など) を除外する閾値。
// 長い道はたとえ片端が行き止まりでも本道として残す。
export const DEAD_END_MAX_LENGTH_M = 50;
