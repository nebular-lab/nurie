---
marp: true
theme: default
paginate: true
style: |
  section {
    font-size: 24px;
  }
  h1 {
    font-size: 40px;
  }
  h2 {
    font-size: 30px;
  }
  code {
    font-size: 0.78em;
  }
  pre code {
    font-size: 18px;
    line-height: 1.22;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    align-items: start;
  }
  .small {
    font-size: 20px;
  }
---

# nurie

歩いた経路で地図を明るくしていく散歩アプリ

<div class="columns">
<div>

## 何をするアプリか

- iPhone で散歩中の GPS を記録する
- 記録を 10 分単位の経路として保存する
- 歩いた経路の周辺 hex パネルを明るくする
- 1km / 3km / 5km の探索率を見る

</div>
<div>

## 今の見せ方

- 地図背景: Stamen Terrain
- 未探索: 濃いネイビーでマスク
- 探索済み: 地図がそのまま見える
- 境界: 青く光る線
- 経路: 細いグリーンの path

</div>
</div>

---

# なぜ作ったか

<div class="columns">
<div>

## きっかけ

- 最近、散歩をしている
- 近所にも歩いたことがない道がある
- どの場所を歩いたかは、普通の地図ではわかりにくい

</div>
<div>

## 作りたい体験

- 暗い地図を少しずつ明るくする
- 歩いた範囲が広がっていく
- 1km / 3km / 5km の達成率が上がる
- 散歩の目的地を自然に決められる

</div>
</div>

---

# 探索の表現

GPS 点を経路 `LineString` として扱い、経路が通った hex パネルを探索済みにする。

<div class="columns">
<div>

## 経路

- 位置情報を時系列の点として受け取る
- 10 分単位で `LineString` にまとめる
- 地図上には細いグリーンの path として表示する
- 再生ボタンで古い経路から順に移動を再生する

</div>
<div>

## hex パネル

- 5km 圏内を六角形に分割する
- 経路が通った hex を探索済みにする
- 未探索 hex は濃いネイビーで隠す
- 明暗境界だけ青く光らせる
- 1/3/5km 内の探索済み hex 割合を表示する

</div>
</div>

---

# 全体構成

- iOS アプリ: Expo / React Native
- 位置情報取得: `expo-location`
- バックグラウンド実行: `expo-task-manager`
- 送信前キュー: SQLite `queued_points`
- クラウド保存: Supabase `tracks`
- 地図描画: MapLibre Native / MapLibre GL JS
- 地図スタイル: Stadia Maps `stamen_terrain`
- 探索領域: `lib/fogHex.ts`

---

# バックグラウンド位置情報

`TaskManager` に location task を登録し、OS から渡される GPS 更新を SQLite の送信前キューへ保存する。

<div class="columns">
<div>

```ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

type LocationTaskData = {
  locations: Location.LocationObject[];
};

TaskManager.defineTask<LocationTaskData>(
  TASK_NAME,
  async ({ data, error }) => {
    if (error || !data) return;
    for (const loc of data.locations) {
      await insertPoint({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        recordedAt: loc.timestamp,
      });
    }
  },
);
```

</div>
<div>

```ts
await Location.startLocationUpdatesAsync(TASK_NAME, {
  accuracy: Location.Accuracy.Highest,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  distanceInterval: 10,
});
```

- `Highest`: 精度優先
- `Fitness`: 徒歩・運動向け
- `false`: iOS に自動停止させにくくする
- `true`: background 取得中を OS に明示
- `10`: 約 10m ごとに更新

</div>
</div>

実装: `lib/locationTask.native.ts`

---

# 経路として Supabase に同期する

SQLite は正本ではなく、送信前の点を一時的に持つキュー。

```sql
CREATE TABLE IF NOT EXISTS queued_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at_ms INTEGER NOT NULL
);
```

10 分単位で点をまとめ、Supabase の `tracks` に `LineString` として保存する。

```ts
path: {
  type: 'LineString',
  coordinates: sorted.map((p) => [p.lng, p.lat]),
}
```

同期後は SQLite の送信済み点を削除する。

---

# MapLibre で地図を描く

iOS も Web も MapLibre 系に揃えている。

<div class="columns">
<div>

## iOS

```text
Map.tsx
  -> Map.native.tsx
```

- `@maplibre/maplibre-react-native`
- `Camera` の `maxBounds` / `minZoom` / `maxZoom`
- native の現在地表示

</div>
<div>

## Web

```text
Map.tsx
  -> Map.web.tsx
```

- `maplibre-gl`
- HTML の `<div>` に地図を描画
- source / layer で表示順を制御

</div>
</div>

地図背景は `https://tiles.stadiamaps.com/styles/stamen_terrain.json`。

---

# 六角形パネルで探索済み領域を表す

5km 圏内を hex に分割し、経路が通った hex を探索済みにする。

```ts
function buildRevealedHexIds(tracks: Track[]): Set<string> {
  const ids = new Set<string>();
  for (const track of tracks) {
    for (const coord of track.path.coordinates) {
      const axial = lngLatToAxial(coord);
      const hex = axialToFogHex(axial);
      if (distanceFromHomeM(hex.center) <= AREA_RADIUS_M + FOG_HEX_RADIUS_M) {
        ids.add(hex.id);
      }
    }
  }
  return ids;
}
```

- 未探索 hex: 濃いネイビーで塗る
- 探索済み hex: 塗らないので地図が見える
- 明暗境界: 探索済み hex の外周だけ青く光らせる

---

# 上部の % は hex タイルの割合

半径内に入る hex パネルのうち、探索済みになった枚数の割合を出す。

```ts
export function aggregateFogCoverageByBands(
  tracks: Track[],
  bandsM: readonly number[],
) {
  return bandsM.map((radiusM) => {
    let totalTiles = 0;
    let revealedTiles = 0;

    for (const hex of buildAllFogHexes()) {
      if (distanceFromHomeM(hex.center) <= radiusM) {
        totalTiles++;
        if (revealedIds.has(hex.id)) revealedTiles++;
      }
    }
    return { totalTiles, revealedTiles };
  });
}
```

`<= radiusM` で判定するので、円のちょうど上にある hex も含める。

---

# ビルドと動作確認

<div class="columns">
<div>

## Web

```bash
pnpm start --web
```

- 開発中は自動更新される
- MapLibre GL JS で見た目を確認しやすい

## iOS 実機

```bash
pnpm ios:release
```

- Expo Go では background location と native MapLibre を確認できない
- 実機 build で確認する

</div>
<div>

## EAS Build

- Expo のクラウドビルド
- ローカルに Xcode 環境がなくても iOS build を作れる
- 配布用 build の作成にも向く

## 注意点

- 位置情報の権限文言
- background 位置情報の許可
- Apple の署名設定

</div>
</div>
