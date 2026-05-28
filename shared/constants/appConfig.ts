// 自宅座標と達成率エリアの設定。
// 自宅で使う場合は HOME を書き換えて再ビルドする。
export const HOME = {
  lat: 35.890076,
  lng: 139.469982,
};

export const AREA_RADIUS_M = 5000; // 自宅から何 m を達成率対象とするか
export const FOG_HEX_RADIUS_M = 90; // 探索済み領域を表す hex の半径

// 自宅からの半径バンド (m)。歩行率の集計と地図上の同心円描画に使う。
// バンドはネスト関係 (1km ⊂ 3km ⊂ 5km)。
export const RADIUS_BANDS_M = [1000, 3000, 5000] as const;
