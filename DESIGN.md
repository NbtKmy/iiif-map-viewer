# DESIGN.md --- IIIF Georeferenced Map Comment Viewer

## 1. 概要

本プロジェクトは、ジオリファレンス済みのIIIF地図画像をウェブ地図上に重ね、別のIIIF資料に含まれる「地図に関する注記・コメント画像」を地図上の対象箇所と結びつけて閲覧できる静的ウェブアプリケーションである。

ユーザー投稿機能、認証、データベース、サーバーサイドAPIは当面実装しない。\
公開データはJSONとして管理し、GitHub Pages、Cloudflare
Pages、Netlify、Vercel等の静的ホスティングで公開できる構成とする。

本プロジェクトは次の2つのアプリケーションから構成する。

1.  **Viewer** --- 一般利用者向けの閲覧画面
2.  **Editor** ---
    コメント資料の画像領域と地図上の対象領域を対応付けるデータ作成画面

Editorで作成したJSONをViewerが読み込む。

---

## 2. 目的

### 2.1 Viewer

Viewerでは以下を実現する。

- 現代のウェブ地図をベースマップとして表示する。
- Allmapsを利用して、ジオリファレンス済みIIIF地図をベースマップ上に重ねる。
- 歴史地図上の注記対象箇所にボタン／マーカーを表示する。
- ボタンを押すとコメントパネルを開く。
- コメントパネルには、別のIIIF資料から切り出した画像領域を表示する。
- 必要に応じてタイトル、説明、出典情報を表示する。
- 元のIIIF資料へ移動できる導線を設ける。

### 2.2 Editor

Editorでは以下を実現する。

- コメント資料側のIIIF ManifestまたはImage Serviceを読み込む。
- コメント資料画像上をドラッグして矩形領域を選択する。
- 選択領域をIIIF画像座標 `x, y, width, height` として取得する。
- 地図画像上で、コメントが指している場所を指定する。
- 地図側は「点」および「矩形」を指定可能にする。
- 対応関係にタイトル等のメタデータを付与する。
- 編集中のデータをブラウザ内で保持する。
- 完成したデータを `annotations.json` として書き出す。
- 既存の `annotations.json` を読み込み、再編集できるようにする。

Editor自体も静的サイトとして動作させる。

---

## 3. 現在の地図データ

地図側には以下のAllmaps Georeference AnnotationPageを使用する。

```text
https://gist.githubusercontent.com/NbtKmy/d5fbd40d5988843641c24398f0db6fec/raw/98a5926966a9ee3ddcee1016dd95c742be3ae2bc/dejima.json
```

このJSONはW3C Web Annotation形式の `AnnotationPage` であり、内部に
`motivation: "georeferencing"` のGeoreference Annotationを持つ。

対象IIIF画像：

```text
https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00003.tif
```

画像サイズ：

```text
width:  7302
height: 4891
```

元Canvas：

```text
https://kokusho.nijl.ac.jp/biblio/300136604/canvas/2
```

元Manifest：

```text
https://kokusho.nijl.ac.jp/biblio/300136604/manifest
```

Georeference Annotationでは2次多項式変換（polynomial order
2）が指定されている。

---

## 4. 基本アーキテクチャ

```text
                     Static Hosting
                          │
          ┌───────────────┴───────────────┐
          │                               │
       Viewer                          Editor
          │                               │
          │                               ├── IIIF comment resource
          │                               │
          │                               ├── region selection
          │                               │
          │                               ├── map target selection
          │                               │
          │                               ▼
          │                       annotations.json
          │                               │
          └───────────────┬───────────────┘
                          │
                          ▼
                   Browser / Client
                          │
              ┌───────────┴───────────┐
              │                       │
          MapLibre GL JS          IIIF Image API
              │                       │
        @allmaps/maplibre       cropped comment image
              │
       Georeference Annotation
              │
              ▼
       georeferenced IIIF map
```

---

## 5. 技術スタック

### 必須

- TypeScript
- MapLibre GL JS
- `@allmaps/maplibre`
- `@allmaps/transform` またはAllmaps内部の座標変換機能
- IIIF Image API
- JSON

### フロントエンド候補

第一候補：

- **SvelteKit + static adapter**

代替：

- React + Vite
- Vue + Vite
- Vanilla TypeScript + Vite

本プロジェクトは規模が小さくサーバー処理を必要としないため、最終成果物を静的ファイルとして出力できる構成を優先する。

---

## 6. ディレクトリ構成案

```text
/
├── DESIGN.md
├── README.md
├── package.json
├── src/
│   ├── lib/
│   │   ├── allmaps/
│   │   ├── iiif/
│   │   ├── annotations/
│   │   └── components/
│   │
│   └── routes/
│       ├── +page.svelte
│       └── editor/
│           └── +page.svelte
│
├── static/
│   └── data/
│       ├── map-georeference.json
│       └── annotations.json
│
└── scripts/
    └── validate-annotations.ts
```

外部GistをViewerから直接取得することも可能だが、公開サイトの再現性を高めるため、Georeference
Annotationをリポジトリ内へ固定して配置する方法も検討する。

---

## 7. Viewer UI

### 7.1 基本レイアウト

デスクトップ：

```text
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
├──────────────────────────────────────┬──────────────────┤
│                                      │                  │
│                                      │ Comment Panel    │
│              Map                     │                  │
│                                      │ title            │
│       [1]                [2]          │                  │
│                                      │ [IIIF crop]      │
│                [3]                   │                  │
│                                      │ description      │
│                                      │                  │
│                                      │ source link      │
└──────────────────────────────────────┴──────────────────┘
```

モバイルではコメントパネルをBottom
Sheetまたは全画面パネルとして表示する。

### 7.2 地図

MapLibre GL JSを使用する。

レイヤー構成：

```text
annotation markers
        ↑
historical map (@allmaps/maplibre)
        ↑
modern basemap
```

Allmapsの `WarpedMapLayer` にGeoreference AnnotationPageを読み込ませる。

地図画像の透明度をユーザーが調整できるUIは、初期版から入れる価値が高い。

```text
古地図の透明度
[────────●────] 70%
```

### 7.3 コメントマーカー

地図上には以下のいずれかを表示する。

- 番号付き円形ボタン
- アイコン
- 小さなラベル

初期版は番号付きボタンとする。

```text
① ② ③ ...
```

クリックすると対応するコメントパネルを開く。

ホバー可能な環境では、対象が矩形の場合に地図上の対象範囲を強調表示してもよい。

### 7.4 コメントパネル

表示項目：

```text
Title

[コメント資料のIIIF切り出し画像]

Description

資料名
ページ／Canvas情報

[元資料を見る]
```

コメント画像は画像ファイルとして保存せず、IIIF Image
APIのregion機能を利用する。

概念例：

```text
{imageService}/{x},{y},{w},{h}/{size}/0/default.jpg
```

---

## 8. Editor UI

EditorはViewerとは別ルート `/editor/` とする。

### 8.1 基本レイアウト

```text
┌──────────────────────────────────────────────────────────────┐
│ Editor                                                       │
├───────────────────────────────┬──────────────────────────────┤
│ Comment Resource              │ Map                          │
│ Manifest URL: [____________] [読み込み]                       │
│ [①][②][③][④] ← サムネイルストリップ（横スクロール）         │
│ ┌───────────────────────────┐ │                              │
│ │                           │ │           [target]           │
│ │       IIIF image          │ │                              │
│ │                           │ │                              │
│ │   ┌───────────────┐       │ │                              │
│ │   │ selected area │       │ │                              │
│ │   └───────────────┘       │ │                              │
│ └───────────────────────────┘ │                              │
├───────────────────────────────┴──────────────────────────────┤
│ Title:       [________________________________________]       │
│ Description: [________________________________________]       │
│                                                              │
│ [Add annotation]                    [Export JSON]             │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 コメント資料の入力

Editorへの資料入力はIIIF Manifest URLに一本化する（対応: IIIF Presentation API 2.0。`sequences[].canvases[].images[].resource.service`構造を前提とする。3.0形式のManifestは現状未対応、必要になった時点で拡張する）。

1.  Manifest URLを入力し「読み込み」を実行する。
2.  取得したManifestのCanvas一覧をサムネイルストリップとして表示する。各サムネイルはIIIF Image APIで動的に生成する小サイズ画像（例: `{imageService}/full/,150/0/default.jpg`）であり、物理的な画像ファイルは生成しない（§21.1のSource of Truthの原則に従う）。
3.  読み込み直後は先頭のCanvas（1ページ目）を自動選択する。
4.  サムネイルをクリックすると選択が切り替わり、メインの画像編集エリアに該当Canvasの画像が表示される。

選択中のCanvasの`id`（Canvas URI）とImage Service `@id`が、コメント領域選択時に`commentSource.canvas` / `commentSource.imageService`として保存される。

Manifest取得に失敗した場合（CORS・404等）や、想定する構造を持たない場合は、サムネイルストリップを表示せずエラーメッセージを表示する（§15参照）。個別のサムネイル画像の読み込みに失敗した場合は、そのサムネイルのみ破損画像プレースホルダーを表示し、他のサムネイルには影響しない。

サムネイルをクリックしてページを切り替えると、選択中の矩形選択（未保存のドラフト）はクリアされる。保存済みのAnnotationには影響しない。

### 8.3 コメント領域選択

画像上でドラッグすると矩形を作る。

保存する値：

```json
{
	"xywh": [1350, 840, 620, 310]
}
```

座標は表示画面のCSSピクセルではなく、**IIIF原画像のピクセル座標**として保存する。

### 8.4 地図側対象指定

地図側の指定方式：

```text
Point
Rectangle
```

#### Point

クリックした位置を元の地図画像座標へ逆変換して保存する。

```json
{
	"type": "point",
	"xy": [4201.4, 2510.8]
}
```

#### Rectangle

地図画像上の範囲を指定する。

```json
{
	"type": "rect",
	"xywh": [3900, 2200, 500, 300]
}
```

Viewer上のマーカー位置は矩形の中心点から算出する。

将来的にPolygonを追加できるデータモデルにしておく。

---

## 9. 座標系の原則

本プロジェクトで重要な設計判断は、コメントと地図の対応関係を**緯度経度ではなく、原則として歴史地図画像上の座標で保存すること**である。

### 保存

```text
historical map image coordinates
```

### 表示

```text
historical map image coordinates
        │
        │ Allmaps transformation
        ▼
geographic coordinates
        │
        ▼
MapLibre
```

これにより、Annotationの意味は、

```text
「北緯32.x、東経129.xについてのコメント」
```

ではなく、

```text
「この歴史地図資料のこの部分についてのコメント」
```

となる。

これは資料間の対応関係を保持する上で重要である。

---

## 10. annotations.json

初期実装では、IIIF Web
Annotationを直接編集するのではなく、アプリケーション用の簡潔なJSON形式を採用する。

### 10.1 基本形

```json
{
	"version": 1,
	"map": {
		"georeference": "/data/map-georeference.json"
	},
	"annotations": [
		{
			"id": "annotation-001",
			"label": "出島東側についての記述",
			"description": "",
			"mapTarget": {
				"type": "point",
				"xy": [4201.4, 2510.8]
			},
			"commentSource": {
				"manifest": "https://example.org/iiif/manifest",
				"canvas": "https://example.org/iiif/canvas/1",
				"imageService": "https://example.org/iiif/image/1",
				"xywh": [1350, 840, 620, 310]
			}
		}
	]
}
```

### 10.2 Rectangle

```json
{
	"mapTarget": {
		"type": "rect",
		"xywh": [3900, 2200, 500, 300]
	}
}
```

### 10.3 将来拡張

将来的には以下を追加できる。

```json
{
	"mapTarget": {
		"type": "polygon",
		"points": [
			[100, 100],
			[200, 120],
			[180, 240]
		]
	}
}
```

また、アプリ用JSONからW3C Web Annotation / IIIF Presentation
API互換データを生成するExporterを追加できる。

---

## 11. IIIFコメント画像URL生成

コメント領域は `xywh` のみ保存する。

Viewerでは次の情報からIIIF Image API URLを生成する。

```text
imageService
x
y
width
height
```

例：

```text
{imageService}/{x},{y},{width},{height}/800,/0/default.jpg
```

ただしImage API 2.x /
3.xの差異や各サーバーのprofileを考慮し、URL生成処理は `iiif/`
モジュールへ隔離する。

将来的にはIIIF Image APIの `info.json`
を読み、対応する最大サイズ等を判断できるようにする。

---

## 12. Editorのデータ保存

Editorにはバックエンドを置かない。

### 初期版

- JSONファイル読み込み
- ブラウザ内編集
- JSONファイル書き出し

### 任意機能

編集途中の事故防止のため、作業中データを `localStorage` に自動保存する。

```text
Edit
 ↓
localStorage autosave
 ↓
Export annotations.json
 ↓
Git commit
 ↓
Static site deploy
```

`localStorage`
は正式データの保存場所ではなく、一時的な作業バックアップとして扱う。

---

## 13. 公開ワークフロー

```text
1. /editor/ を開く

2. コメント資料のIIIF Manifest URLを入力

3. 対象Canvasを選択

4. コメント部分をドラッグ選択

5. 地図上の対応箇所をPointまたはRectangleで指定

6. タイトル等を入力

7. Add annotation

8. 必要な件数だけ繰り返す

9. Export JSON

10. static/data/annotations.json を更新

11. Git commit / push

12. 静的ホスティングが自動deploy
```

---

## 14. バリデーション

Editorおよびビルド時に最低限以下を検証する。

- `id` が重複していない。
- `mapTarget.type` が既知の値である。
- 地図座標が7302×4891の画像範囲内にある。
- `commentSource.xywh` が正の値である。
- `imageService` が存在する。
- `label` が存在する。
- Rectangleのwidth/heightが0より大きい。

JSON
SchemaまたはZod等でスキーマを定義し、EditorとViewerで同一スキーマを利用する。

---

## 15. エラー処理

Viewerでは、1件のAnnotationが壊れていてもサイト全体を停止させない。

例：

- IIIF画像取得失敗 → 「画像を取得できませんでした」と表示。
- Annotation座標不正 → そのAnnotationのみ非表示。
- Georeference Annotation取得失敗 →
  ベースマップとエラーメッセージを表示。
- `annotations.json` 取得失敗 → 古地図のみ表示可能にする。

Editorでは保存前に不正データを明示する。

---

## 16. アクセシビリティ

マーカーはマウス操作だけに依存させない。

- `button` 相当の操作要素として実装する。
- キーボードフォーカス可能にする。
- `aria-label` にAnnotationのlabelを設定する。
- コメントパネルをキーボードで閉じられるようにする。
- IIIF切り出し画像には適切な `alt` を付与する。
- 色だけで選択状態を表現しない。

---

## 17. URLと状態

ViewerではAnnotationへの直接リンクを可能にする。

例：

```text
/?annotation=annotation-001
```

このURLを開くと、

1.  地図を対象箇所へ移動
2.  Annotationを選択
3.  コメントパネルを開く

という状態を復元する。

将来的には地図のzoom/centerもURLに保存できる。

---

## 18. MVP

最初の実装では以下だけを完成させる。

### Viewer MVP

- MapLibreベースマップ
- 出島Georeference Annotationの表示
- `annotations.json` 読み込み
- Pointマーカー表示
- マーカークリック
- コメントパネル
- IIIF region画像表示
- 古地図透明度調整

### Editor MVP

- IIIF Manifest URL入力
- Manifest読み込み・Canvas一覧のサムネイルストリップ表示
- サムネイルクリックによるページ選択（読み込み直後は1ページ目を自動選択）
- コメント画像表示
- 矩形選択
- `xywh` 取得
- 地図表示
- 地図上Point指定
- label入力
- Annotation追加／削除
- JSON import
- JSON export
- localStorage autosave

---

## 19. MVP後

優先度順：

1.  地図側Rectangle指定
2.  Annotation編集
3.  Annotation並べ替え
4.  Viewerで対象範囲ハイライト
5.  Annotation直接リンク
6.  元CanvasをIIIF Viewerで開く
7.  Polygon対応
8.  W3C Web Annotation / IIIF Annotation export
9.  複数地図対応
10. IIIF Presentation API 3.0形式のManifest対応

---

## 20. 非目標

現段階では以下を実装しない。

- ユーザーコメント投稿
- ユーザー認証
- データベース
- CMS
- サーバーサイドAPI
- リアルタイム共同編集
- EditorからGitHubへの直接commit
- コメント画像の物理的なcropファイル生成

必要になった時点で別フェーズとして検討する。

---

## 21. 設計上の重要原則

### 21.1 Source of Truthは原資料

切り出し画像を新しい画像ファイルとして複製せず、IIIF Image
APIのregionで参照する。

### 21.2 資料座標を保存する

地図Annotationは可能な限り歴史地図画像上の座標として保存し、地理座標は表示時に導出する。

### 21.3 EditorとViewerを分離する

閲覧に不要な編集コードをViewerへ持ち込まない。

### 21.4 静的公開を維持する

サーバーが本当に必要になるまで、JSON + IIIF +ブラウザだけで完結させる。

### 21.5 独自JSONは交換形式ではない

`annotations.json` は編集・表示を簡単にする内部形式と位置づける。\
長期保存・交換が必要になった場合はW3C Web Annotation / IIIF Presentation
APIへの変換を行う。

---

## 22. 実装上の検討事項

### CORS

外部IIIFサーバー、Georeference
Annotation、Manifestをブラウザから取得するため、各配信元のCORS設定を確認する必要がある。

対象資料（`kokusho.nijl.ac.jp`）のManifestエンドポイントおよびIIIF Image API（`info.json`等）は`Access-Control-Allow-Origin: *`を返すことを確認済み。他機関の資料を扱う場合は資料ごとに確認する。

### Allmaps座標変換API

ViewerとEditorで必要になる以下の変換について、実装開始時に使用するAllmaps
APIを固定する。

```text
resource/image coordinate -> geographic coordinate
geographic coordinate     -> resource/image coordinate
```

AllmapsのパッケージAPIは更新される可能性があるため、依存バージョンを
`package.json` で固定する。

### MapLibre pitch

現行の `@allmaps/maplibre`
ドキュメントではpitchは未対応とされているため、地図は `maxPitch: 0`
とする。

### 外部依存データ

Gistを直接本番依存にするか、リポジトリへGeoreference
Annotationをコピーして固定するかを実装前に決める。

再現性を優先する場合はリポジトリ内への固定を推奨する。

---

## 23. 完成条件

初期バージョンは以下を満たした時点で完成とする。

- 静的ホスティングだけでViewerが動作する。
- 出島のIIIF画像が現代地図上に正しく重なる。
- `annotations.json` の各Pointが地図上の正しい位置に表示される。
- マーカーを押すと対応するIIIFコメント領域が表示される。
- Editorだけでコメント領域と地図位置の対応データを作れる。
- Editorから出力したJSONをViewerへ置くだけで反映できる。
- DB、認証、独自画像サーバーを必要としない。

---

## 24. 参考仕様・ドキュメント

- Allmaps: https://allmaps.org/
- `@allmaps/maplibre`: https://allmaps.org/docs/packages/maplibre
- `@allmaps/transform`: https://allmaps.org/docs/packages/transform
- IIIF Image API 3.0: https://iiif.io/api/image/3.0/
- IIIF Presentation API 3.0: https://iiif.io/api/presentation/3.0/
- W3C Web Annotation: https://www.w3.org/TR/annotation-model/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/

---

## 25. 次の作業

次の実装フェーズでは、まずViewerの最小プロトタイプを作成する。

```text
Phase 1
  MapLibre
    +
  @allmaps/maplibre
    +
  dejima Georeference Annotation
```

これで出島図が正しく表示されることを確認した後、

```text
Phase 2
  dummy annotations.json
    +
  marker
    +
  comment panel
```

を追加する。

その後、

```text
Phase 3
  IIIF region selector editor
    +
  map target selector
    +
  JSON import/export
```

を実装する。

この順序にすることで、Allmapsの表示・座標変換、ViewerのAnnotation表示、Editorという3つの問題を分離して検証できる。
