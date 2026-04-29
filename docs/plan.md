# nurie 実装計画

React Native / Expo の学習も兼ねるため、各ステップで実機動作確認 → レビュー → 次へ進める。

## 進め方

- 1 ステップずつ実装し、終わったら停止してユーザーがレビューする
- 各ステップ後にミニ学習まとめを口頭で出す (ファイルには残さない)
- 詰まりそうな箇所 (Step 5 のバックグラウンド、Step 6 のグラデーション) は実装前に設計を相談する

## Step 1. 開発環境の確認と Dev Client への切り替え

- 現状: Expo SDK 54 + Expo Router の最小構成。`expo-location` のバックグラウンド動作や `react-native-maps` は Expo Go では動かないので、最初に Expo Dev Client (development build) に切り替える
- やること:
  - `expo-dev-client` 導入
  - `npx expo run:ios` で実機 (またはシミュレータ) に開発ビルドを 1 回流す
  - `app.json` の `bundleIdentifier` 設定など Free Apple ID 用の準備
- レビューポイント: 真っ白な画面が実機で起動するか / Free Apple ID 署名が通るか
- 学習ポイント: Expo Go と Dev Client の違い、なぜ今回 Dev Client が必須か

## Step 2. 地図を 1 画面に全画面表示

- `react-native-maps` 導入
- `app/index.tsx` を `MapView` で埋める。Provider は iOS デフォルト (Apple Maps)
- ズーム 16 / 初期中心は仮で日本中心 (東京付近) 固定
- レビューポイント: 地図がフルスクリーンで出るか / SafeArea の扱い
- 学習ポイント: `View` の `flex` レイアウト、`StyleSheet`、`react-native-maps` の基礎

## Step 3. 現在地取得と現在地ボタン (foreground のみ)

- `expo-location` 導入
- 起動時に「常に許可」を直接要求 (F-5)
- 取得できたら現在地を中心にカメラ移動 / ズーム 16
- 右下に現在地ボタン (再センター)
- フォールバック順: 現在地 → 最後に記録した点 → 全経路フィット → 日本全体 (この時点では「現在地 → 日本全体」だけ実装。後段で拡張)
- レビューポイント: 「常に許可」ダイアログの文言 / 拒否時に地図だけ出るか / 現在地ボタンの動作
- 学習ポイント: `useEffect` での権限要求、`useRef` で MapView を掴む、関数コンポーネントのライフサイクル

## Step 4. ローカル DB (expo-sqlite) スキーマと保存層

- `expo-sqlite` 導入
- スキーマ設計 (例):
  - `points(id, lat, lng, recorded_at)` のシンプル 1 テーブル
  - 「経路 (session)」概念は持たず、点の時系列だけで管理 (途切れは表示時に判定)
- 保存関数 / 直近 N 件取得関数 / 全件取得関数を `lib/db.ts` に切り出し
- この段階ではまだ画面から手動操作はせず、開発時のテストコードで 1 点だけ INSERT して動作確認
- レビューポイント: スキーマ設計の妥当性 / API 設計 (DB アクセスの抽象化レベル)
- 学習ポイント: Expo の SQLite API、非同期処理、データ層の分離

## Step 5. バックグラウンド経路記録

- `expo-task-manager` 導入
- `Location.startLocationUpdatesAsync` で `Accuracy.Balanced` / `distanceInterval: 10` (F-1)
- 受信した点を Step 4 の保存関数で SQLite へ追記
- `app.json` に `UIBackgroundModes: ["location"]` と `NSLocationAlwaysAndWhenInUseUsageDescription` を追加
- レビューポイント: 画面ロック中に歩いて点が貯まるか (Mac から離れて実地テスト)
- 学習ポイント: TaskManager の仕組み、バックグラウンドタスクが切れる挙動、iOS のバックグラウンド制約

## Step 6. 過去経路の地図表示と色分け

- 起動時に SQLite から全点を読み出し、日付でグルーピング
- `Polyline` で各日のラインを描画
- 色分け (F-2):
  - 過去: 古い日ほど薄いグレー → 新しいほど濃いグレー (日付順で線形補間)
  - 今日: 赤
- 移動中の自動追従はしない (カメラを触らない)
- フォールバック (Step 3 で省いたもの) を全部入れる: 最後の点 / 全経路フィット
- レビューポイント: 何日か歩いた後に色のグラデーションが意図通りか / 点が増えた時のパフォーマンス
- 学習ポイント: `useMemo` での計算最適化、`Polyline` の使い方、データ → ビューの変換

## Step 7. 仕上げと運用テスト

- 権限拒否 / 位置取得失敗時のフォールバック挙動を実機で再確認
- 7 日サイクルでの再ビルド手順を README にメモ
- バッテリー消費の様子を 1 日見る
- レビューポイント: 通しで散歩 → 帰宅後に経路が出ているか / 翌日起動して色分けされるか
- 学習ポイント: 実運用での問題発見と切り分け
