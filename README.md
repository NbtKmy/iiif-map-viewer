# IIIF地図コメントビューア

ジオリファレンス済みIIIF地図画像をウェブ地図上に重ね、別のIIIF資料に含まれる注記・コメント画像を地図上の対象箇所と結びつけて閲覧できる静的ウェブアプリケーション。

詳細な設計は [`DESIGN.md`](./DESIGN.md)、実装工程は [`PROCESS.md`](./PROCESS.md)、開発規約は [`CLAUDE.md`](./CLAUDE.md) を参照。

## 構成

- **Viewer**（`/`） — 一般利用者向けの閲覧画面
- **Editor**（`/editor/`） — コメント資料の画像領域と地図上の対象領域を対応付けるデータ作成画面

## 開発

```sh
npm install
npm run dev -- --open
```

## ビルド

```sh
npm run build       # build/ に静的ファイルを出力
npm run preview     # ビルド結果をローカルで確認
```

GitHub Pages用のbase pathは環境変数 `BASE_PATH` で指定する（`main` push時はGitHub Actionsが自動設定）。

## その他のコマンド

```sh
npm run check    # 型・テンプレート検証（svelte-check）
npm run lint     # ESLint + Prettier チェック
npm run format   # Prettier フォーマット
```

## デプロイ

`main` ブランチへのpushで GitHub Actions（[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)）が自動ビルド・GitHub Pagesへデプロイする。
