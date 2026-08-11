# CLAUDE.md

このファイルは、このリポジトリで作業するClaude Code（および開発者）向けのリファレンスである。

## プロジェクト概要

ジオリファレンス済みIIIF地図画像をウェブ地図上に重ね、別のIIIF資料に含まれる注記・コメント画像を地図上の対象箇所と結びつけて閲覧できる静的ウェブアプリケーション。

- **Viewer**（`/`） — 一般利用者向けの閲覧画面
- **Editor**（`/editor/`） — コメント資料の画像領域と地図上の対象領域を対応付けるデータ作成画面

ユーザー投稿・認証・データベース・サーバーサイドAPIは実装しない。すべて静的ファイル（HTML/JS/CSS + JSON）としてGitHub Pagesで公開する。

詳細な設計判断・データモデル・UI仕様は `DESIGN.md` を参照。実装工程は `PROCESS.md` を参照。

## 技術スタック

- **SvelteKit** + `@sveltejs/adapter-static`（完全静的サイト出力）
- **TypeScript**
- **MapLibre GL JS** — ベースマップ表示
- **@allmaps/maplibre** — Georeference AnnotationをMapLibre上に重畳表示
- **@allmaps/transform** — 画像座標・地理座標間の相互変換
- **Zod** — `annotations.json` のスキーマ検証（Viewer/Editor共通スキーマ）
- **npm** — パッケージ管理
- **ESLint + Prettier** — Lint/Format

依存バージョンは `package.json` で固定する（Allmaps系パッケージはAPI変更の可能性があるため）。

## ディレクトリ構成

```
/
├── CLAUDE.md
├── DESIGN.md
├── PROCESS.md
├── package.json
├── vite.config.ts        # SvelteKitプラグイン設定（adapter-static, base path）
├── src/
│   ├── lib/
│   │   ├── allmaps/       # Allmaps連携（WarpedMapLayer, 座標変換）
│   │   ├── iiif/          # IIIF Image API URL生成、Manifest/Image Service取得
│   │   ├── annotations/   # annotations.json スキーマ（Zod）、import/export
│   │   └── components/    # UIコンポーネント（マーカー、コメントパネル、透明度スライダー等）
│   └── routes/
│       ├── +page.svelte           # Viewer
│       └── editor/
│           └── +page.svelte       # Editor
├── static/
│   └── data/
│       ├── map-georeference.json  # 出島Georeference Annotation（リポジトリ内固定コピー）
│       └── annotations.json       # 公開用アノテーションデータ
├── scripts/
│   └── validate-annotations.ts    # annotations.json バリデーションCLI
└── .github/
    └── workflows/
        └── deploy.yml              # GitHub Actions: build & deploy
```

## 主要コマンド

```bash
npm run dev              # 開発サーバー起動
npm run build            # 静的ビルド（build/ 出力）
npm run check            # svelte-check（型・テンプレート検証）
npm run lint             # ESLint
npm run format           # Prettier
npm run validate:annotations  # static/data/annotations.json のスキーマ検証
```

## 設計上の重要原則

DESIGN.md §21より:

1. **Source of Truthは原資料** — コメント画像を複製せず、IIIF Image APIのregionパラメータで参照する。物理的なcropファイルは生成しない。
2. **資料座標を保存する** — 地図Annotationは歴史地図画像上の座標として保存し、緯度経度は表示時にAllmapsで導出する（§9）。「北緯x度・東経y度についてのコメント」ではなく「この歴史地図資料のこの部分についてのコメント」という意味を保つ。
3. **EditorとViewerを分離する** — 閲覧に不要な編集コードをViewerへ持ち込まない。
4. **静的公開を維持する** — サーバーが本当に必要になるまでJSON + IIIF + ブラウザだけで完結させる。
5. **独自JSONは交換形式ではない** — `annotations.json` は内部形式。長期保存・交換が必要になればW3C Web Annotation / IIIF Presentation APIへの変換を検討する。

## 座標系

- **保存**: 歴史地図画像座標（ピクセル）
- **表示**: 歴史地図画像座標 → Allmaps変換 → 地理座標 → MapLibre描画

Editor側のコメント領域選択（`xywh`）は表示画面のCSSピクセルではなく、IIIF原画像のピクセル座標として保存する。

## 外部データの扱い

出島のGeoreference Annotation（Allmaps Gist）は再現性を優先し、`static/data/map-georeference.json` としてリポジトリ内に固定コピーする。出典URLはファイル内またはコミットメッセージに記録する。

元データ:

```
https://gist.githubusercontent.com/NbtKmy/d5fbd40d5988843641c24398f0db6fec/raw/98a5926966a9ee3ddcee1016dd95c742be3ae2bc/dejima.json
```

## デプロイ

- 単一リポジトリ・単一GitHub Pagesで `/`（Viewer）と `/editor/`（Editor）を公開
- `main` へのpushでGitHub Actionsが自動ビルド・デプロイ（`.github/workflows/deploy.yml`）
- `vite.config.ts` の `sveltekit({ paths: { base } })` を環境変数 `BASE_PATH` で設定（ビルド時のみ。devサーバーでは空のまま）
- 外部IIIFサーバー・Manifest取得時はCORS設定に注意する

## バリデーション

`annotations.json` は以下を最低限検証する（DESIGN.md §14）:

- `id` の重複なし
- `mapTarget.type` が既知の値
- 地図座標が地図画像範囲内（現状 7302×4891）
- `commentSource.xywh` が正の値
- `imageService` の存在
- `label` の存在
- Rectangleのwidth/heightが0より大きい

ViewerとEditorで同一のZodスキーマ（`src/lib/annotations/`）を使用する。

## テスト方針

MVPでは自動テストを導入せず、Zodによる実行時バリデーションで担保する。テスト追加は「MVP後」フェーズで検討する。
