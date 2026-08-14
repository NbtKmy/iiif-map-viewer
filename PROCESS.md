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

- [x] `src/lib/annotations/schema.ts` に `annotations.json` のZodスキーマを定義（DESIGN.md §10）
- [x] `src/lib/iiif/` にIIIF Image API region URL生成関数を実装（`{imageService}/{x},{y},{w},{h}/{size}/0/default.jpg`、Image API 2.x/3.x差異を吸収）
- [x] ダミーの `static/data/annotations.json`（Point型を2〜3件）を作成
- [x] annotations読み込み・Zod検証・不正annotationのスキップ処理を実装（DESIGN.md §15）
- [x] 地図上にPointマーカー（番号付き円形ボタン）を表示
- [x] マーカークリックでコメントパネルを開閉
- [x] コメントパネルにIIIF切り出し画像・title・description・出典・元資料リンクを表示
- [x] アクセシビリティ対応（`button`要素、キーボードフォーカス、`aria-label`、`alt`属性、パネルのEsc閉じ）（DESIGN.md §16）
- [x] エラー処理: IIIF画像取得失敗時のメッセージ表示、`annotations.json` 取得失敗時のフォールバック（DESIGN.md §15）

**完了条件**: 満たした。Playwrightでdevサーバーを起動し実際にブラウザで確認 — ダミーデータのPoint 3件が出島の地図画像上の正しい位置に表示され、クリックでIIIF切り出し画像・label・description・元資料リンクを含むコメントパネルが開くこと、Escキーでの閉じ、Tabキーによるマーカーへのキーボードフォーカス、`annotations.json`取得失敗時・IIIF画像取得失敗時のエラー表示を確認済み。

## Phase 3: Editor実装

DESIGN.md §25 Phase3に対応。目的: annotations.jsonを実際に作成できるようにする。

- [x] `src/routes/editor/+page.svelte` ルート作成
- [x] IIIF Manifest URL入力→Canvas一覧サムネイル表示→選択→画像表示（IIIF Image Service URL直接入力は§8.2改訂によりMVPスコープから除外）
- [x] 画像上のドラッグ矩形選択→IIIF原画像ピクセル座標での `xywh` 取得
- [x] 地図上でのPoint指定→地理座標から地図画像座標への逆変換（`@allmaps/transform`）
- [x] Annotation追加・削除、label/description入力フォーム
- [x] `annotations.json` のJSON import（既存データの再編集）
- [x] `annotations.json` のJSON export（ファイルダウンロード）
- [x] `localStorage` への自動保存（作業中データのバックアップ、正式データではない旨をUIに明示）
- [x] 保存前バリデーション（Editor/Viewer共通のZodスキーマを使用、不正データを明示）

**完了条件**: 満たした。Playwrightでdevサーバーを起動し実際にブラウザで確認 — Manifest読み込み→ドラッグ矩形選択で複数のコメント画像領域を追加→地図クリックでPoint指定（IIIF原画像座標に逆変換）→タイトル入力してAnnotation追加、必須項目未入力時の検証エラー表示、削除ボタンでの一覧からの削除、Export JSONでのダウンロードと`version/map/annotations`形式の確認、ダウンロードしたファイルの再importによる復元、不正JSON（`georeference`欠落）import時のエラー表示、`npm run build`でのSSR/prerenderクラッシュ無し、localStorageへの自動保存とリロード時の復元・「ドラフトをクリア」ボタンでの消去を確認済み。

## Phase 4: 公開ワークフロー確認（完了）

- [x] `annotations.json` を `static/data/` に配置（Phase2/3で作成済みのダミーデータ3件をそのまま採用）
- [x] `scripts/validate-annotations.ts` を実装し `npm run validate:annotations` で `static/data/annotations.json` を検証できるようにする（CLAUDE.md記載とのズレを解消）
- [x] commit → push → GitHub Actions自動デプロイを確認（コミット71bed68, 4292504, 8789618とも成功確認済み）
- [x] DESIGN.md §23の完成条件をすべて確認:
  - [x] 静的ホスティングだけでViewerが動作する（GitHub Pages公開URL https://nbtkmy.github.io/iiif-map-viewer/ で確認済み。バグ修正・ズーム機能追加はEditor側のみの変更でViewerコードには影響しないため引き続き有効）
  - [x] 出島のIIIF画像が現代地図上に正しく重なる
  - [x] `annotations.json` の各Pointが地図上の正しい位置に表示される
  - [x] マーカーを押すと対応するIIIFコメント領域が表示される
  - [x] Editorだけでコメント領域と地図位置の対応データを作れる
  - [x] Editorから出力したJSONをViewerへ置くだけで反映できる（Editorで実annotation「Magazins」を作成→Export→`static/data/annotations.json`へ配置→pushのみでViewerに反映、公開URLで確認済み）
  - [x] DB、認証、独自画像サーバーを必要としない（設計上該当機能を実装していないため自明）

**完了条件**: 満たした。GitHub Pages公開URLで、出島の古地図が現代地図上に正しく重なり、`annotations.json`のPoint（Editorで実際に作成した「Magazins」、commentSources2件）が地図上の正しい位置に表示され、マーカークリックで対応するIIIF切り出し画像が表示されることを確認済み。EditorでのManifest読み込み→矩形選択（ズーム機能付き）→地図Point指定→annotation追加→JSON export→`static/data/annotations.json`への配置→commit/pushのみでViewerへ反映される、という一連の公開ワークフローを実データで検証した。DESIGN.md §23の完成条件を全項目満たし、MVP初期バージョンが完成した。

## MVP後（優先順・DESIGN.md §19）

1. 地図側Rectangle指定
2. IIIF Manifest読み込みとCanvas選択
3. Annotation編集（完了。Editor一覧の「編集」ボタンでフォーム・地図・矩形領域一覧に既存annotationを読み込み、Update annotationで上書き保存できる）
4. Annotation並べ替え（完了。Editor一覧の↑↓ボタンでannotations配列の順序を入れ替え可能）
5. Viewerで対象範囲ハイライト
6. Annotation直接リンク（`/?annotation=annotation-001`）
7. 元CanvasをIIIF Viewerで開く導線
8. Polygon対応
9. W3C Web Annotation / IIIF Annotation export
10. 複数地図対応
