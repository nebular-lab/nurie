# nurie クラウド同期 & Web ビューワー 実装計画

iOS アプリは引き続き散歩記録のメインクライアントとして使いつつ、記録した点を
リモート DB に同期して **Web からも閲覧できる** ようにする。

## 背景とゴール

- これまでは iPhone ローカルの SQLite が唯一のストレージで、Web から見る手段がなかった
- ゴール: 同じ記録を Web からも地図 + 進捗 % で確認できる
- スコープ:
  - **Web は閲覧専用** (記録は iOS のみ)
  - 認証は「本人 1 人だけ」(Supabase Auth + RLS)
  - Web の見た目は現状 iOS と同じ (地図 + 点 + バンド %)

## 進め方

- 既存実装と同じく 1 フェーズずつ実装 → 動作確認 → 次へ
- Phase 1 完了後に iOS が Supabase に書き込めることを確認、その後 Web 表示に進む
- 既存のローカル SQLite は **残す**。記録バッファ兼オフライン耐性の役割を持たせ、
  そこから Supabase に sync する構成にする (圏外でも記録が落ちないため)

## アーキテクチャ

```
[iOS アプリ]                              [Web アプリ]
 ├ GPS → ローカル SQLite に即書き込み      └ Supabase REST で読むだけ
 │      (synced=0 で挿入)                       (閲覧専用、書き込み権限なし)
 └ 定期 sync ジョブ                              ↑
   └ synced=0 の点を Supabase に upsert         │
     成功したら synced=1 に更新                 │
                          ↓                     │
                  [Supabase (PostgreSQL)]───────┘
                   + Auth (本人 1 人)
                   + RLS (auth.uid() = user_id)
```

## 技術選定

| 項目 | 選定 | 理由 |
|---|---|---|
| バックエンド | Supabase (PostgreSQL) | Free tier で足りる / RN・Web 両対応 SDK / SQL で集計しやすい |
| 認証 | Supabase Auth (Email + Password) | RLS と組み合わせて本人だけ読める |
| 同期戦略 | ローカル SQLite → 定期 upsert | 圏外で記録が落ちない / 既存タスクに手を入れない |
| Web フロント | Expo Web (同一コードベース) | React Native Web で再利用、地図だけ分岐 |
| Web の地図 | MapLibre GL JS | OSS / Stadia Maps のタイルがそのまま使える |
| Web デプロイ | Cloudflare Pages | 無料・速い・静的サイト向け |

---

## Phase 1. Supabase セットアップ

### やること

#### 1.1 プロジェクト作成

- [supabase.com](https://supabase.com) で新規プロジェクト
- リージョン: **Tokyo (ap-northeast-1)**
- DB パスワードは控えておく (今回は直接使わないが、後で psql で繋ぐ時用)

#### 1.2 テーブルと RLS

ダッシュボードの **SQL Editor** で以下を実行する。

```sql
-- points テーブル
CREATE TABLE points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ユーザーごとの時系列読み出し用インデックス
CREATE INDEX idx_points_user_recorded ON points (user_id, recorded_at);

-- 同じ点を 2 回 upsert しても増えないための一意制約
-- (端末側のローカル id とは別、サーバ側の冪等キー)
CREATE UNIQUE INDEX uq_points_user_recorded_at
  ON points (user_id, recorded_at, lat, lng);

-- RLS 有効化
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

-- 自分の行だけ読める
CREATE POLICY "select own points" ON points
  FOR SELECT USING (auth.uid() = user_id);

-- 自分の user_id でだけ書ける
CREATE POLICY "insert own points" ON points
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 1.3 アカウント作成

ダッシュボードの **Authentication > Users > Add user > Create new user** で
本人用のメールアドレス + パスワードを 1 つ作る。"Auto Confirm User" にチェック。

#### 1.4 新規登録の無効化

**Authentication > Sign In / Up > Email** で **Enable Sign Ups をオフ** に。
本人しか使わないので、外から登録できない方が安全。

#### 1.5 値を控える

**Project Settings > API** から:

- `Project URL` (例: `https://xxxxx.supabase.co`)
- `anon` `public` key

これらを `.env` に書く (anon key は公開しても OK、Service Role key は **絶対に渡さない**)。

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### レビューポイント

- ダッシュボードの Table Editor で `points` テーブルが見えること
- Authentication > Users に作成したユーザーが 1 人いること
- RLS が ON になっていること (Tables 一覧で鍵アイコン)

---

## Phase 2. iOS アプリに同期機能を追加

### やること

#### 2.1 ライブラリ追加

```
pnpm add @supabase/supabase-js expo-secure-store
```

- `expo-secure-store`: refresh token の永続化用 (AsyncStorage より安全)

#### 2.2 Supabase クライアントを 1 箇所で作る

`lib/supabase.ts` を新規:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` を読む
- `createClient` で生成
- `auth.storage` に SecureStore を渡す (RN では AsyncStorage がデフォルトで効かない)

#### 2.3 ローカル SQLite に同期フラグ追加

`lib/db.ts`:

- `points` テーブルに `synced INTEGER NOT NULL DEFAULT 0` カラムを追加
- 既存行は default で `0` 扱い (= 全部「未同期」になり、初回 sync 時にまとめて送られる)
- `insertPoint` は今まで通り (synced=0 で入る)
- 新規関数:
  - `getUnsyncedPoints(limit: number)`: synced=0 の点を取得
  - `markPointsSynced(ids: number[])`: 同期済みフラグを立てる

#### 2.4 ログイン画面 (最小)

- 未ログイン状態のときだけ表示するモーダル
- メアド + パスワード入力 → `supabase.auth.signInWithPassword`
- 成功したら閉じる
- 失敗したらメッセージ表示
- 新規登録 UI は持たない (Phase 1 で Sign Ups は無効化済み)

`app/_layout.tsx` あたりで起動時にセッション状態を見て、未ログインなら
このモーダルを出す。

#### 2.5 同期ジョブ

`lib/syncTask.ts` を新規:

- アプリが foreground のあいだ、5 分間隔で動く `setInterval` を 1 つ持つ
- 1 回の sync:
  1. `getUnsyncedPoints(500)` でバッチ取得
  2. `supabase.from('points').upsert([...], { onConflict: 'user_id,recorded_at,lat,lng' })`
  3. 成功したらローカルの synced=1 に
- ネットワークエラーは握りつぶす (次回 sync で再試行される)
- アプリ起動直後にも 1 回走らせる

> バックグラウンド (アプリを閉じている時) の sync は最初はやらない。
> 散歩中はローカルに溜め、アプリを開いた時にまとめて送る方針。

#### 2.6 進捗表示への影響

- `useStoredTrackPoints` は今まで通りローカルから読む (Web 側は別実装、Phase 3)
- StatusBadge も今まで通り

### レビューポイント

- 起動 → ログイン → 5 分後にダッシュボードで点が増えていることを確認
- 機内モードで歩く → 戻ってオンラインにする → 自動で同期されること
- 同じ点が 2 回 upsert されても重複行が増えないこと (一意制約で吸収)

### 学習ポイント

- Supabase の Auth セッション永続化のセオリー (RN は SecureStore 必須)
- `upsert` と PostgreSQL の `ON CONFLICT`
- RLS が効いている時、anon key だけでも書き込めるカラクリ (JWT の `sub` claim)

---

## Phase 3. Expo Web 対応

### やること

#### 3.1 Web ビルドの素振り

- `app.json` の `web.output: "static"` は既に設定済み
- `pnpm exec expo export -p web` で `dist/` に出ることを確認
- まずはエラーが出る前提でログを取る (expo-location, expo-task-manager,
  expo-sqlite, react-native-maps が Web 非対応で落ちるはず)

#### 3.2 Platform-specific extension で分岐

以下のファイルを `*.native.ts(x)` と `*.web.ts(x)` に分割する。
Expo の bundler が拡張子を見て自動で選んでくれる。

- `lib/locationTask.ts` → Web 版は no-op (`startTracking` / `stopTracking` を空関数で export)
- `lib/db.ts` → Web 版は Supabase 直アクセスにする (SQLite を使わない)
  - `getAllPoints()` は `supabase.from('points').select(...)` に置き換え
  - `insertPoint` / `getUnsyncedPoints` / `markPointsSynced` は Web では使われないので no-op か未実装エラー
- `lib/hooks/useLocationTracking.ts` → Web 版は `{ state: { status: 'paused', isEnabled: false }, start: noop, stop: noop }`
- 地図関連を 1 箇所にまとめる:
  - `lib/components/Map.tsx` に MapView 周りを集約
  - `lib/components/Map.native.tsx` = 現状の react-native-maps 実装
  - `lib/components/Map.web.tsx` = **MapLibre GL JS** で書き直し
    - `maplibre-gl` を web 専用に install (`pnpm add maplibre-gl`)
    - 同じ Stadia タイル URL を使う
    - 黄ドット (`RawPointsOverlay`) は Marker または GeoJSON Source で表現
    - バンドの円も同様 (`RadiusBandsOverlay`)
- `app/index.tsx` から `TrackingToggleButton` と `RecenterButton` を Web では
  非表示 (`Platform.OS === 'web' ? null : <Button />`)

#### 3.3 Web 用のデータフロー

- 起動時に Phase 2 と同じ認証フロー
- ログイン後、`supabase.from('points').select('lat, lng, recorded_at').order('recorded_at')`
  で全点取得
- リアルタイム更新が欲しければ `supabase.channel().on('postgres_changes')` で
  購読も可能だが、まずは初期取得だけで OK
- `useStoredTrackPoints` の web 版を Supabase 取得に差し替える

#### 3.4 ログイン UI を Web でも使う

- Phase 2 で作ったログインモーダルは React Native コンポーネント
- React Native Web で動くか確認 (`<TextInput>` `<Pressable>` は OK のはず)

### レビューポイント

- `pnpm exec expo start --web` で localhost に立ち上がること
- ログインして点が地図上に表示されること
- iOS で歩いて 5 分後、Web をリロードすると新しい点が出ること

### 学習ポイント

- Platform-specific extension のメカニズム (bundler の解決順)
- MapLibre GL JS の基本 (Source / Layer / Marker)
- React Native Web で動くコンポーネントと動かないコンポーネントの境界

---

## Phase 4. Cloudflare Pages にデプロイ

### やること

#### 4.1 ビルド成果物の確認

- `pnpm exec expo export -p web` で `dist/` を生成
- ローカルで `pnpm exec serve dist` を試して、動くことを確認

#### 4.2 Cloudflare Pages にデプロイ

- Cloudflare ダッシュボード > Pages > Create a project
- GitHub repo (`nebular-lab/nurie`) を連携
- Build 設定:
  - Build command: `pnpm install && pnpm exec expo export -p web`
  - Build output directory: `dist`
  - Environment variables:
    - `EXPO_PUBLIC_SUPABASE_URL`
    - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
    - `EXPO_PUBLIC_STADIA_API_KEY`
- 初回デプロイ後、`<project>.pages.dev` の URL が払い出される

#### 4.3 Supabase の許可ドメイン

- Supabase ダッシュボード **Authentication > URL Configuration** で
  - **Site URL**: `https://<project>.pages.dev`
  - **Redirect URLs**: 同上
- これをやらないとログイン後のリダイレクトが弾かれる

#### 4.4 カスタムドメイン (任意)

- 持っているドメインがあれば Cloudflare Pages で紐付け
- HTTPS は自動

### レビューポイント

- 払い出された URL を別の端末で開けること
- ログイン → 自分の散歩経路が見えること
- iOS で記録 → 同期 → Web をリロードして反映されること

### 学習ポイント

- Cloudflare Pages の build 設定
- Supabase の Site URL 設定とリダイレクト

---

## 注意点・トレードオフ

### Anon key を公開すること

- `EXPO_PUBLIC_*` の値は Web のソースに埋め込まれる = ブラウザのソースから見える
- これは Supabase の設計通りで OK。**RLS が効いている限り**、anon key だけでは
  他人のデータは触れない
- ただし `Service Role key` を `EXPO_PUBLIC_*` に **絶対** 入れない

### バックグラウンド同期はしない

- 散歩中 (アプリを開いてない時) には sync しない設計
- アプリを開いたタイミングでまとめて送る
- 結果として、Web 側のデータは数分〜数時間遅れることがある
- これが許容できないなら、別途 BackgroundFetch などを検討する (まずは無し)

### Stadia API キー

- 現状 iOS で `EXPO_PUBLIC_STADIA_API_KEY` を使っているが、Web では HTTP Referer
  制限が効かない (Stadia 側で `*.pages.dev` を許可リストに入れる必要あり)
- Stadia ダッシュボードで Allowed Origins を設定する

### Web で地図ライブラリを 2 つ持つこと

- iOS は react-native-maps、Web は MapLibre GL JS という二重構成
- 見た目を完全に揃えるのは難しい (色や線の太さは個別に調整)
- 同じ Stadia タイルを使うので、地図の絵自体は同じ

### 7 日サイクル問題は変わらない

- Free Apple ID の制限は今回の対応とは独立した話
- Web ビューワーが動いていれば、iOS が一時的に動かなくても過去の記録は見られる
  (= バックアップ的な役割も果たす)
