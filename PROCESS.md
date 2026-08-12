# PROCESS.md

DESIGN.md §25の3フェーズ構想を、着手可能な粒度のタスクに分解した実装工程表。上から順に進める。各Phaseは前Phaseの成果物の上に構築される。

## Phase 0: プロジェクトセットアップ（完了）

- [x] `npx sv create` でSvelteKitプロジェクト初期化（TypeScript, ESLint, Prettier有効化）
- [x] `@sveltejs/adapter-static` を導入（`vite.config.ts` の `sveltekit()` プラグインに設定。SvelteKit最新版では `svelte.config.js` ではなく `vite.config.ts` に統合されている）
- [x] `vite.config.ts` に `paths.base` を設定（環境変数 `BASE_PATH` で切り替え。devサーバーでは常に空、ビルド時のみ適用）
- [x] 全ページprerender有効化（`src/routes/+layout.ts` に `export const prerender = true`。adapter-staticで完全静的出力するために必須）
- [x] `src/lib/{allmaps,iiif,annotations,components}/` ディレクトリを作成
- [x] `static/data/` ディレクトリを作成
- [x] `zod` を依存に追加
- [x] `maplibre-gl`、`@allmaps/maplibre`、`@allmaps/transform` を依存に追加（Allmaps系はDESIGN.md §22に従いバージョン厳密固定）
- [x] `.github/workflows/deploy.yml` を作成（`main` push時に `npm ci && npm run build` → `actions/deploy-pages` でデプロイ）
- [x] GitHub リポジトリ作成（public）・push、Pages "Source: GitHub Actions" を有効化
- [x] READMEに開発コマンド（`npm run dev` 等）を記載

**完了条件**: 満たした。`npm run dev` でデフォルトページが起動（HTTP 200）、`npm run build` が完全静的サイト（`index.html` 含む）を出力、GitHub Actionsのデプロイが成功し https://nbtkmy.github.io/iiif-map-viewer/ で公開確認済み。

## Phase 1: Viewer最小プロトタイプ（完了）

DESIGN.md §25 Phase1に対応。目的: Allmapsの表示・座標変換だけを検証する。

- [x] 出島Georeference Annotation（Gist）を `static/data/map-georeference.json` として固定コピー
- [x] `src/routes/+page.svelte` にMapLibreの地図を表示
- [x] `@allmaps/maplibre` の `WarpedMapLayer` で `map-georeference.json` を読み込み、古地図をベースマップ上に重畳
- [x] `maxPitch: 0` を設定（`@allmaps/maplibre` はpitch未対応のため）
- [x] 古地図の透明度調整スライダーを実装（DESIGN.md §7.2）
- [x] MapLibre GL JS v6をViteで使う際に必要な `setWorkerUrl()` 明示呼び出しと `ssr.noExternal` 設定（ハマりどころ。未設定だとワーカーファイルが404になり地図が全く描画されない）

**完了条件**: 満たした。Playwrightでdevサーバーを起動し実際にブラウザで確認 — 出島のIIIF画像が現代地図（CARTO Voyagerスタイル）上の正しい位置に重なって表示され、透明度スライダーで古地図の見え方を調整できることを確認済み。

**完了条件**: 出島のIIIF画像が現代地図上の正しい位置に重なって表示される。

## Phase 2: Annotation表示

DESIGN.md §25 Phase2に対応。目的: Viewerのannotation表示ロジックを検証する。

- [ ] `src/lib/annotations/schema.ts` に `annotations.json` のZodスキーマを定義（DESIGN.md §10）
- [ ] `src/lib/iiif/` にIIIF Image API region URL生成関数を実装（`{imageService}/{x},{y},{w},{h}/{size}/0/default.jpg`、Image API 2.x/3.x差異を吸収）
- [ ] ダミーの `static/data/annotations.json`（Point型を2〜3件）を作成
- [ ] annotations読み込み・Zod検証・不正annotationのスキップ処理を実装（DESIGN.md §15）
- [ ] 地図上にPointマーカー（番号付き円形ボタン）を表示
- [ ] マーカークリックでコメントパネルを開閉
- [ ] コメントパネルにIIIF切り出し画像・title・description・出典・元資料リンクを表示
- [ ] アクセシビリティ対応（`button`要素、キーボードフォーカス、`aria-label`、`alt`属性、パネルのEsc閉じ）（DESIGN.md §16）
- [ ] エラー処理: IIIF画像取得失敗時のメッセージ表示、`annotations.json` 取得失敗時のフォールバック（DESIGN.md §15）

**完了条件**: ダミーデータのPointが地図上の正しい位置に表示され、クリックでIIIF切り出し画像を含むコメントパネルが開く。

## Phase 3: Editor実装

DESIGN.md §25 Phase3に対応。目的: annotations.jsonを実際に作成できるようにする。

- [x] `src/routes/editor/+page.svelte` ルート作成
- [x] IIIF Manifest URL入力→Canvas一覧サムネイル表示→選択→画像表示（IIIF Image Service URL直接入力は§8.2改訂によりMVPスコープから除外）
- [ ] 画像上のドラッグ矩形選択→IIIF原画像ピクセル座標での `xywh` 取得
- [ ] 地図上でのPoint指定→地理座標から地図画像座標への逆変換（`@allmaps/transform`）
- [ ] Annotation追加・削除、label/description入力フォーム
- [ ] `annotations.json` のJSON import（既存データの再編集）
- [ ] `annotations.json` のJSON export（ファイルダウンロード）
- [ ] `localStorage` への自動保存（作業中データのバックアップ、正式データではない旨をUIに明示）
- [ ] 保存前バリデーション（Editor/Viewer共通のZodスキーマを使用、不正データを明示）

**完了条件**: Editorのみでコメント領域と地図位置の対応データを作成でき、出力したJSONを `static/data/annotations.json` に置くだけでViewerに反映される。

## Phase 4: 公開ワークフロー確認

- [ ] Editorで作成した `annotations.json` を `static/data/` に配置
- [ ] commit → push → GitHub Actions自動デプロイを確認
- [ ] DESIGN.md §23の完成条件をすべて確認:
  - [ ] 静的ホスティングだけでViewerが動作する
  - [ ] 出島のIIIF画像が現代地図上に正しく重なる
  - [ ] `annotations.json` の各Pointが地図上の正しい位置に表示される
  - [ ] マーカーを押すと対応するIIIFコメント領域が表示される
  - [ ] Editorだけでコメント領域と地図位置の対応データを作れる
  - [ ] Editorから出力したJSONをViewerへ置くだけで反映できる
  - [ ] DB、認証、独自画像サーバーを必要としない

## MVP後（優先順・DESIGN.md §19）

1. 地図側Rectangle指定
2. IIIF Manifest読み込みとCanvas選択
3. Annotation編集
4. Annotation並べ替え
5. Viewerで対象範囲ハイライト
6. Annotation直接リンク（`/?annotation=annotation-001`）
7. 元CanvasをIIIF Viewerで開く導線
8. Polygon対応
9. W3C Web Annotation / IIIF Annotation export
10. 複数地図対応
