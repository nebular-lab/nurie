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

歩いた道を塗っていく散歩アプリ

<div class="columns">
<div>

## 何をするアプリか

- iPhone で散歩中の GPS を記録する
- 家の周りの道路データと照合する
- 歩いた道を地図上で色分けする
- Web でも記録済みの道を見る

</div>
<div>

## 見えるもの

- 現在地
- 1km / 3km / 5km の範囲
- 今日歩いた道
- 過去に歩いた道
- 道路ごとの達成率

</div>
</div>

---

# なぜ作ったか

<div class="columns">
<div>

## きっかけ

- 最近、散歩をしている
- 近所にも歩いたことがない道がある
- どの道が未踏なのかは、普通の地図ではわからない

</div>
<div>

## 作りたい体験

- 未踏の道が見える
- そこに向かって散歩する
- 歩いた道が塗られる
- 達成率が少し上がる
- 活動範囲が自然に広がる

</div>
</div>

---

# 全体構成

- iOS アプリ: Expo / React Native
- 位置情報取得: `expo-location`
- バックグラウンド実行: `expo-task-manager`
- ローカル保存: SQLite
- クラウド同期: Supabase
- iOS 地図: `react-native-maps`
- Web 地図: MapLibre GL JS
- 道路データ: `lib/walkableRoadsData.json`
- 道路データ生成: `scripts/fetch-gsi-roads.mjs`

---

# バックグラウンド位置情報

`TaskManager` に location task を登録して、OS から渡される GPS 更新を SQLite に保存する。

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

---

# TaskManager はいつ動くか

`Location.startLocationUpdatesAsync(TASK_NAME, options)` を呼ぶと、OS が位置更新を監視し始める。

<div class="columns">
<div>

## 実行タイミング

- アプリが foreground のとき
- アプリが background のとき
- OS が位置更新をまとめて配送したとき
- `distanceInterval` などの条件を満たしたとき

</div>
<div>

## `data.locations` の中身

- 1回の task 実行で複数点が来ることがある
- 各 `loc` は緯度・経度・timestamp を持つ

```ts
loc.coords.latitude
loc.coords.longitude
loc.timestamp
```

</div>
</div>

実装: `lib/locationTask.native.ts`

---

# startLocationUpdatesAsync

`startLocationUpdatesAsync` は、指定した task 名に対して継続的な位置更新を開始する API。

```ts
await Location.startLocationUpdatesAsync(TASK_NAME, {
  accuracy: Location.Accuracy.Highest,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  distanceInterval: 10,
});
```

<div class="small">

- `accuracy`: GPS 精度。`Highest` は精度優先
- `activityType`: 移動種別。`Fitness` は徒歩・運動向け
- `pausesUpdatesAutomatically`: iOS に自動停止させるか。`false` で止まりにくくする
- `showsBackgroundLocationIndicator`: background 取得中の青い表示。`true` で OS に明示する
- `distanceInterval`: 何 m 動いたら更新するか。`10` は約 10m ごと

</div>

---

# 道路データをどう作るか

`scripts/fetch-gsi-roads.mjs` で、国土地理院のベクトルタイルから道路中心線を取得して JSON にする。

```bash
node scripts/fetch-gsi-roads.mjs
```

生成の流れ:

1. `HOME` から半径 5km を覆う z=15 のタイル範囲を計算
2. GSI の PBF タイルを取得
3. `road` レイヤーから道路中心線の `ftCode` だけ採用
4. タイル境界の重複を `feature.id` で除去
5. 半径 5km 以内に触れる道路だけ残す
6. 端点がつながる線を merge する
7. `{ id, highway, coords }` で `walkableRoadsData.json` に書き出す

---

# walkableRoadsData.json

アプリに同梱している道路中心線データ。現在は 12,675 本の道路が入っている。

<div class="columns">
<div>

## データ型

```ts
type RawWalkableRoad = {
  id: number;
  highway: string;
  coords: [number, number][];
};
```

`coords` は GeoJSON と同じ `[lng, lat]`。

</div>
<div>

## 例

```json
{
  "id": 0,
  "highway": "primary",
  "coords": [
    [139.416718, 35.901948],
    [139.416665, 35.901976],
    [139.416528, 35.902057]
  ]
}
```

</div>
</div>

起動時に `totalM`, `bbox`, `minDistFromHome` を追加計算して使う。

---

# Supabase 同期

同期は「散歩中の記録を邪魔しない」ことを優先する。

- GPS はまず SQLite に保存する
- 10分単位で未同期データをまとめて Supabase に送る
- 送信できた点だけ `synced = 1` にする
- Web は Supabase の `tracks` を読む

```ts
await supabase.from('tracks').upsert(rows, {
  onConflict: 'user_id,started_at,ended_at',
  ignoreDuplicates: true,
});
```

同じ点が複数回送られても、`upsert` で重複を避ける。

---

# iOS と Web の地図を切り替える

同じ `Map` import でも、platform file によって別の実装が選ばれる。

```ts
import { Map } from '@/lib/components/Map';
```

<div class="columns">
<div>

## iOS

```text
Map.tsx
  -> Map.native.tsx
```

- `react-native-maps`
- `MapView`
- `UrlTile`
- native の現在地表示

</div>
<div>

## Web

```text
Map.tsx
  -> Map.web.tsx
```

- MapLibre GL JS
- HTML の `<div>` に地図を描画
- Supabase から読んだ点を表示

</div>
</div>

---

# ビルドと動作確認

<div class="columns">
<div>

## Expo Go

- 手軽に UI は確認できる
- background location は確認できない
- native module の挙動確認にも限界がある

## 実機 build

```bash
pnpm ios:release
```

- 実機に Release build を入れて確認する
- background 位置情報はここで見る

</div>
<div>

## EAS Build

- Expo のクラウドビルド
- ローカルに Xcode 環境がなくても iOS build を作れる
- 配布用 build の作成にも向く

## App Store 向け

- Xcode で Archive
- 署名・権限・位置情報文言を確認する

</div>
</div>
