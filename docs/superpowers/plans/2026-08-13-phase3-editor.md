# Phase 3 Editor実装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EditorだけでコメントIIIF画像領域と地図上の対象位置の対応データ（`annotations.json`）を作成・編集・保存できるようにする（PROCESS.md Phase3）。同時に、1つのannotationに複数のIIIF切り出し画像を紐付けられるよう`commentSource`をスキーマレベルで配列化する。

**Architecture:** 既存の`src/routes/editor/+page.svelte`（Manifest URL入力→Canvas選択は実装済み）に、(1) 画像上のドラッグ矩形選択、(2) 地図上のPoint指定（`@allmaps/transform`の逆変換）、(3) Annotationドラフト管理フォーム、(4) JSON import/export、(5) localStorage自動保存を追加する。地図表示ロジックはViewer(`src/routes/+page.svelte`)と重複するため、`src/lib/allmaps/`に共通ヘルパーとして先に抽出する。

**Tech Stack:** SvelteKit(Svelte 5 runes) + TypeScript + Zod + MapLibre GL JS + `@allmaps/maplibre` + `@allmaps/transform`。既存の`src/lib/iiif/`, `src/lib/annotations/`モジュールを拡張する。

## Global Constraints

- 自動テストは導入しない。各タスクの検証は `npm run check`（型検証）・`npm run lint`（Prettier+ESLint）・開発サーバーでの実ブラウザ動作確認で行う（CLAUDE.md「テスト方針」）。
- EditorとViewerを分離する。閲覧に不要な編集コードをViewerへ持ち込まない（DESIGN.md §21.3）。地図表示など両者で共通の処理のみ`src/lib/`に抽出する。
- 資料座標（IIIF画像ピクセル座標）を保存し、地理座標は表示・入力時にAllmapsで導出する（DESIGN.md §9）。
- Source of Truthは原資料。コメント画像は複製せずIIIF Image APIのregionで参照する（DESIGN.md §21.1）。
- Editorの矩形選択はCSSピクセルではなくIIIF原画像のピクセル座標として保存する（DESIGN.md §8.3 / CLAUDE.md）。
- IIIF Manifestは Presentation API 2.0のみ対応（既存方針、変更しない）。
- 地図側対象指定はPointのみを本フェーズで実装する（Rectangleは DESIGN.md §19 MVP後 優先度1のため対象外）。
- 地図座標は現状の地図画像範囲7302×4891内であることをZodスキーマで検証する（CLAUDE.md バリデーション章、DESIGN.md §14。現在の`schema.ts`にこの上限チェックが無いため本計画のTask 1で追加する）。
- Svelte 5のイベント属性記法（`onclick`, `onsubmit`等）・`$state`/`$derived`/`$effect`runesを使う。既存コードの記法に合わせる。
- ブラウザAPI（`localStorage`, `crypto.randomUUID`等）は`onMount`やイベントハンドラ内でのみ呼ぶ（全ページ`prerender = true`のため、トップレベル/`$state`初期値でのアクセスはビルド時SSRでクラッシュする）。
- コミットは各タスク末尾で行ってよい（過去セッションでmain直接コミット運用を確認済み）。

---

## Task 1: `commentSource`の配列化とスキーマの地図範囲バリデーション追加

**Files:**

- Modify: `src/lib/annotations/schema.ts`
- Modify: `src/lib/components/CommentPanel.svelte`
- Modify: `static/data/annotations.json`
- Modify: `DESIGN.md`（§10 annotations.json）

**Interfaces:**

- Produces: `Annotation.commentSources: CommentSource[]`（旧`commentSource: CommentSource`から改名・配列化）。`CommentSource`型自体（`{manifest, canvas, imageService, xywh}`）は変更なし。`AnnotationSchema`, `AnnotationsFileSchema`はexport維持。

- [ ] **Step 1: `schema.ts`を変更する**

`src/lib/annotations/schema.ts`の内容を以下に置き換える。

```ts
import { z } from 'zod';

const MAP_IMAGE_WIDTH = 7302;
const MAP_IMAGE_HEIGHT = 4891;

const PointTargetSchema = z.object({
	type: z.literal('point'),
	xy: z.tuple([
		z.number().nonnegative().max(MAP_IMAGE_WIDTH),
		z.number().nonnegative().max(MAP_IMAGE_HEIGHT)
	])
});

const RectTargetSchema = z.object({
	type: z.literal('rect'),
	xywh: z.tuple([
		z.number().nonnegative().max(MAP_IMAGE_WIDTH),
		z.number().nonnegative().max(MAP_IMAGE_HEIGHT),
		z.number().positive(),
		z.number().positive()
	])
});

const MapTargetSchema = z
	.discriminatedUnion('type', [PointTargetSchema, RectTargetSchema])
	.superRefine((target, ctx) => {
		if (target.type !== 'rect') return;
		const [x, y, w, h] = target.xywh;
		if (x + w > MAP_IMAGE_WIDTH) {
			ctx.addIssue({
				code: 'custom',
				message: `Rectangleの範囲が地図画像の幅(${MAP_IMAGE_WIDTH})を超えています。`,
				path: ['xywh']
			});
		}
		if (y + h > MAP_IMAGE_HEIGHT) {
			ctx.addIssue({
				code: 'custom',
				message: `Rectangleの範囲が地図画像の高さ(${MAP_IMAGE_HEIGHT})を超えています。`,
				path: ['xywh']
			});
		}
	});

const CommentSourceSchema = z.object({
	manifest: z.string().min(1),
	canvas: z.string().min(1),
	imageService: z.string().min(1),
	xywh: z.tuple([
		z.number().nonnegative(),
		z.number().nonnegative(),
		z.number().positive(),
		z.number().positive()
	])
});

export const AnnotationSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	description: z.string().default(''),
	mapTarget: MapTargetSchema,
	commentSources: z.array(CommentSourceSchema).min(1)
});

export const AnnotationsFileSchema = z
	.object({
		version: z.literal(1),
		map: z.object({
			georeference: z.string().min(1)
		}),
		annotations: z.array(AnnotationSchema)
	})
	.superRefine((file, ctx) => {
		const seenIds = new Set<string>();
		file.annotations.forEach((annotation, index) => {
			if (seenIds.has(annotation.id)) {
				ctx.addIssue({
					code: 'custom',
					message: `idが重複しています: ${annotation.id}`,
					path: ['annotations', index, 'id']
				});
			}
			seenIds.add(annotation.id);
		});
	});

export type MapTarget = z.infer<typeof MapTargetSchema>;
export type CommentSource = z.infer<typeof CommentSourceSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationsFile = z.infer<typeof AnnotationsFileSchema>;
```

- [ ] **Step 2: 型チェックを実行し、`CommentPanel.svelte`がエラーになることを確認する**

Run: `npm run check`
Expected: `src/lib/components/CommentPanel.svelte`で`annotation.commentSource`が存在しないというエラーが出る（想定内。次のステップで直す）。

- [ ] **Step 3: `CommentPanel.svelte`を複数画像表示に対応させる**

`src/lib/components/CommentPanel.svelte`の内容を以下に置き換える。

```svelte
<script lang="ts">
	import type { Annotation } from '$lib/annotations/schema';
	import { buildCommentImageUrl } from '$lib/iiif/imageApi';
	import { resolveCanvasViewerUrl } from '$lib/iiif/manifest';

	let {
		annotation,
		onclose
	}: {
		annotation: Annotation;
		onclose: () => void;
	} = $props();

	let erroredIndexes = $state<Set<number>>(new Set());

	$effect(() => {
		annotation.id;
		erroredIndexes = new Set();
	});

	function handleImageError(index: number) {
		erroredIndexes = new Set(erroredIndexes).add(index);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<aside class="comment-panel" aria-label="コメント詳細">
	<button type="button" class="close-button" aria-label="閉じる" onclick={onclose}>×</button>

	<h2>{annotation.label}</h2>

	{#each annotation.commentSources as source, index (index)}
		<figure class="comment-source">
			{#if erroredIndexes.has(index)}
				<p class="image-error">画像を取得できませんでした。</p>
			{:else}
				<img
					class="comment-image"
					src={buildCommentImageUrl(source.imageService, source.xywh)}
					alt={annotation.label}
					onerror={() => handleImageError(index)}
				/>
			{/if}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部IIIF資料への絶対URLのため対象外 -->
			<a
				class="source-link"
				href={resolveCanvasViewerUrl(source.canvas)}
				target="_blank"
				rel="noreferrer"
			>
				元資料を見る
			</a>
		</figure>
	{/each}

	{#if annotation.description}
		<p class="description">{annotation.description}</p>
	{/if}
</aside>

<style>
	.comment-panel {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 320px;
		max-width: 100%;
		overflow-y: auto;
		padding: 1.5rem;
		background: white;
		box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
	}

	.close-button {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 2rem;
		height: 2rem;
		border: none;
		background: transparent;
		font-size: 1.25rem;
		cursor: pointer;
	}

	h2 {
		margin: 0 2rem 1rem 0;
		font-size: 1.1rem;
	}

	.comment-source {
		margin: 0 0 1.5rem 0;
	}

	.comment-image {
		display: block;
		width: 100%;
		height: auto;
		margin-bottom: 0.5rem;
	}

	.image-error {
		color: #900;
	}

	.description {
		white-space: pre-wrap;
	}

	.source-link {
		display: inline-block;
	}

	@media (max-width: 640px) {
		.comment-panel {
			top: auto;
			width: 100%;
			max-height: 60vh;
		}
	}
</style>
```

- [ ] **Step 4: 型チェックとlintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 5: ダミーデータ`static/data/annotations.json`を新スキーマに移行する**

各annotationの`"commentSource": {...}`を`"commentSources": [{...}]`に変更する（既存の値をそのまま1要素の配列に包む）。3件とも同様に変更する。

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
			"description": "出島東側に並ぶ建物群についての記述。",
			"mapTarget": {
				"type": "point",
				"xy": [5780, 3780]
			},
			"commentSources": [
				{
					"manifest": "https://kokusho.nijl.ac.jp/biblio/300136604/manifest",
					"canvas": "https://kokusho.nijl.ac.jp/biblio/300136604/canvas/0",
					"imageService": "https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00001.tif",
					"xywh": [300, 250, 700, 450]
				}
			]
		},
		{
			"id": "annotation-002",
			"label": "出島中央部についての記述",
			"description": "出島中央部の街路についての記述。",
			"mapTarget": {
				"type": "point",
				"xy": [3900, 3300]
			},
			"commentSources": [
				{
					"manifest": "https://kokusho.nijl.ac.jp/biblio/300136604/manifest",
					"canvas": "https://kokusho.nijl.ac.jp/biblio/300136604/canvas/1",
					"imageService": "https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00002.tif",
					"xywh": [1200, 900, 650, 400]
				}
			]
		},
		{
			"id": "annotation-003",
			"label": "出島西側についての記述",
			"description": "出島西側の水路についての記述。",
			"mapTarget": {
				"type": "point",
				"xy": [1400, 2900]
			},
			"commentSources": [
				{
					"manifest": "https://kokusho.nijl.ac.jp/biblio/300136604/manifest",
					"canvas": "https://kokusho.nijl.ac.jp/biblio/300136604/canvas/2",
					"imageService": "https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00003.tif",
					"xywh": [2500, 1600, 800, 500]
				}
			]
		}
	]
}
```

- [ ] **Step 6: `npm run validate:annotations`が無いことを確認する（既知のギャップ、対応不要）**

`package.json`に`validate:annotations`スクリプトは未実装（CLAUDE.md記載とのズレ）。本Phaseのスコープ外のため、ここでは対応しない。気になる場合はPhase4以降で別タスクとして扱う。

- [ ] **Step 7: 開発サーバーで動作確認する**

Run: `npm run dev`（既に起動中でなければ）
ブラウザで `http://localhost:5173/` を開き、マーカーをクリックしてコメントパネルに画像1件・「元資料を見る」リンクが表示されることを確認する（表示件数は変わらないはずだが、内部的に配列アクセスになっているため確認する）。

- [ ] **Step 8: `DESIGN.md` §10 annotations.jsonの記述を更新する**

`commentSource`（単数オブジェクト）の例を`commentSources`（配列）に書き換える。§10.1の例：

```json
{
	"id": "annotation-001",
	"label": "出島東側についての記述",
	"description": "",
	"mapTarget": {
		"type": "point",
		"xy": [4201.4, 2510.8]
	},
	"commentSources": [
		{
			"manifest": "https://example.org/iiif/manifest",
			"canvas": "https://example.org/iiif/canvas/1",
			"imageService": "https://example.org/iiif/image/1",
			"xywh": [1350, 840, 620, 310]
		}
	]
}
```

`commentSources`が配列であること（1つのannotationに複数のIIIF切り出し画像を紐付けられること）を一文で補足する。

- [ ] **Step 9: commit**

```bash
git add src/lib/annotations/schema.ts src/lib/components/CommentPanel.svelte static/data/annotations.json DESIGN.md
git commit -m "feat: commentSourceを配列化し1annotationに複数IIIF画像を紐付け可能にする"
```

---

## Task 2: Allmaps共通ヘルパーの抽出（Viewer/Editor共通の地図読み込み処理）

**Files:**

- Create: `src/lib/allmaps/georeference.ts`
- Create: `src/lib/allmaps/maplibreSetup.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**

- Consumes: なし（Viewerの既存ロジックの抽出）
- Produces:
  - `ensureMaplibreWorker(): void`
  - `class GeoreferenceLoadError extends Error {}`
  - `loadGeoreferencedMap(url: string, map: MaplibreMap, warpedMapLayer: WarpedMapLayer): Promise<{ transformer: GcpTransformer | undefined }>`（Task 3で`EditorMap.svelte`が使う）

- [ ] **Step 1: `src/lib/allmaps/maplibreSetup.ts`を作成する**

```ts
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let initialized = false;

export function ensureMaplibreWorker(): void {
	if (initialized) return;
	setWorkerUrl(maplibreWorkerUrl);
	initialized = true;
}
```

- [ ] **Step 2: `src/lib/allmaps/georeference.ts`を作成する**

```ts
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { WarpedMapLayer } from '@allmaps/maplibre';
import { parseAnnotation } from '@allmaps/annotation';
import { GcpTransformer } from '@allmaps/transform';

export class GeoreferenceLoadError extends Error {}

export type GeoreferenceLoadResult = {
	transformer: GcpTransformer | undefined;
};

export async function loadGeoreferencedMap(
	url: string,
	map: MaplibreMap,
	warpedMapLayer: WarpedMapLayer
): Promise<GeoreferenceLoadResult> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	if (!response.ok) {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	let georeferenceAnnotation: unknown;
	try {
		georeferenceAnnotation = await response.json();
	} catch {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	const results = warpedMapLayer.addGeoreferenceAnnotation(georeferenceAnnotation);
	const firstError = results.find((result) => result instanceof Error);
	if (firstError) {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	const bounds = warpedMapLayer.getBounds();
	if (bounds) {
		map.fitBounds(bounds, { padding: 40 });
	}

	const georeferencedMaps = parseAnnotation(georeferenceAnnotation);
	const transformer =
		georeferencedMaps.length > 0
			? GcpTransformer.fromGeoreferencedMap(georeferencedMaps[0])
			: undefined;

	return { transformer };
}
```

- [ ] **Step 3: `src/routes/+page.svelte`を共通ヘルパー使用に書き換える**

`import { WarpedMapLayer } from '@allmaps/maplibre';`の下、既存の`setWorkerUrl(maplibreWorkerUrl);`と`import maplibreWorkerUrl ...`行を削除し、代わりに以下をimportして呼ぶ。

```ts
import { ensureMaplibreWorker } from '$lib/allmaps/maplibreSetup';
import { loadGeoreferencedMap } from '$lib/allmaps/georeference';
```

トップレベルの`setWorkerUrl(maplibreWorkerUrl);`を`ensureMaplibreWorker();`に置き換える。

`onMount`内の`map.on('load', async () => {...})`ブロック内、Georeference読み込み部分（`try { const response = await fetch(...) ... transformer = GcpTransformer.fromGeoreferencedMap(...) } catch (error) { loadError = ...; console.error(error); }`）を以下に置き換える。

```ts
try {
	const result = await loadGeoreferencedMap(
		`${base}/data/map-georeference.json`,
		map!,
		warpedMapLayer!
	);
	transformer = result.transformer;
} catch (error) {
	loadError = 'ジオリファレンス地図を読み込めませんでした。';
	console.error(error);
}
```

`parseAnnotation`, `GcpTransformer`のimportが`+page.svelte`内で他に使われていなければ削除する（`GcpTransformer`型注釈`let transformer: GcpTransformer | undefined;`があるため型のみ`import type { GcpTransformer } from '@allmaps/transform';`として残す。`parseAnnotation`は不要になるため削除）。

- [ ] **Step 4: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 5: 開発サーバーでVieweの表示を再確認する（挙動が変わっていないことの確認）**

Run: `npm run dev`
ブラウザで `http://localhost:5173/` を開き、出島の古地図が現代地図上に重なって表示され、マーカー3件・透明度スライダーが以前と同様に動作することを確認する。

- [ ] **Step 6: commit**

```bash
git add src/lib/allmaps/georeference.ts src/lib/allmaps/maplibreSetup.ts src/routes/+page.svelte
git commit -m "refactor: Georeference読み込み処理をViewer/Editor共通のallmapsヘルパーへ抽出"
```

---

## Task 3: `EditorMap.svelte` — 地図表示とPoint指定（逆変換）

**Files:**

- Create: `src/lib/components/EditorMap.svelte`
- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**

- Consumes: `ensureMaplibreWorker`, `loadGeoreferencedMap`（Task 2）
- Produces: `EditorMap`コンポーネントのprops `{ selectedPoint: [number, number] | undefined; onselectpoint: (resourcePoint: [number, number]) => void }`（Task 5で使用）

- [ ] **Step 1: `src/lib/components/EditorMap.svelte`を作成する**

```svelte
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Map as MaplibreMap, Marker } from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import type { GcpTransformer } from '@allmaps/transform';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { ensureMaplibreWorker } from '$lib/allmaps/maplibreSetup';
	import { loadGeoreferencedMap } from '$lib/allmaps/georeference';

	ensureMaplibreWorker();

	let {
		selectedPoint,
		onselectpoint
	}: {
		selectedPoint: [number, number] | undefined;
		onselectpoint: (resourcePoint: [number, number]) => void;
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: MaplibreMap | undefined;
	let transformer: GcpTransformer | undefined;
	let marker: Marker | undefined;
	let loadError = $state<string | undefined>(undefined);

	onMount(() => {
		map = new MaplibreMap({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
			center: [129.8686, 32.7443],
			zoom: 14,
			maxPitch: 0
		});

		const warpedMapLayer = new WarpedMapLayer();

		map.on('load', async () => {
			// @ts-expect-error WarpedMapLayer implements CustomLayerInterface but MapLibre's layer types are incompatible
			map!.addLayer(warpedMapLayer);

			try {
				const result = await loadGeoreferencedMap(
					`${base}/data/map-georeference.json`,
					map!,
					warpedMapLayer
				);
				transformer = result.transformer;
			} catch (error) {
				loadError = 'ジオリファレンス地図を読み込めませんでした。';
				console.error(error);
			}
		});

		map.on('click', (event) => {
			if (!transformer) return;
			const resourcePoint = transformer.transformToResource([event.lngLat.lng, event.lngLat.lat]);
			onselectpoint(resourcePoint);
		});
	});

	onDestroy(() => {
		marker?.remove();
		map?.remove();
	});

	$effect(() => {
		marker?.remove();
		marker = undefined;
		if (!selectedPoint || !transformer || !map) return;
		const [lon, lat] = transformer.transformToGeo(selectedPoint);
		marker = new Marker({ color: '#e11d48' }).setLngLat([lon, lat]).addTo(map);
	});
</script>

<div class="editor-map" bind:this={mapContainer}></div>

{#if loadError}
	<p class="error" role="alert">{loadError}</p>
{/if}

<style>
	.editor-map {
		width: 100%;
		height: 100%;
		min-height: 320px;
	}

	.error {
		color: #900;
		background: #fee;
		padding: 0.5rem 1rem;
		border-radius: 4px;
	}
</style>
```

- [ ] **Step 2: `src/routes/editor/+page.svelte`に地図パネルを仮組み込みする（動作確認用）**

`<script>`内、既存のimportの下に追加する。

```ts
import EditorMap from '$lib/components/EditorMap.svelte';

let selectedPoint = $state<[number, number] | undefined>(undefined);

function handleMapSelectPoint(point: [number, number]) {
	selectedPoint = point;
}
```

テンプレート、`</section>`（`.comment-resource`の閉じタグ）の下に追加する。

```svelte
<section class="map-target">
	<h2>Map</h2>
	<div class="map-area">
		<EditorMap {selectedPoint} onselectpoint={handleMapSelectPoint} />
	</div>
	{#if selectedPoint}
		<p>選択中の座標: {selectedPoint[0].toFixed(1)}, {selectedPoint[1].toFixed(1)}</p>
	{/if}
</section>
```

`<style>`に追加する。

```css
.map-target {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-top: 1rem;
}

.map-area {
	height: 400px;
}
```

（このセクションはTask 5で実際のannotationフォームに統合される。ここでは逆変換が正しく動作することの確認が目的。）

- [ ] **Step 3: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 4: ブラウザで動作確認する**

Run: `npm run dev`
ブラウザで `http://localhost:5173/editor/` を開き、Mapパネルに出島の地図が表示され、地図上をクリックすると赤いマーカーが立ち、その下に「選択中の座標: x, y」がIIIF原画像座標（0〜7302, 0〜4891の範囲）で表示されることを確認する。

- [ ] **Step 5: commit**

```bash
git add src/lib/components/EditorMap.svelte src/routes/editor/+page.svelte
git commit -m "feat: Editorに地図パネルとPoint指定（逆変換）を追加"
```

---

## Task 4: `RegionSelector.svelte` — ドラッグ矩形選択

**Files:**

- Create: `src/lib/components/RegionSelector.svelte`
- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**

- Consumes: なし
- Produces: `RegionSelector`コンポーネントのprops `{ imageUrl: string; canvasWidth: number; canvasHeight: number; onselect: (xywh: [number, number, number, number]) => void }`（Task 5で使用）

- [ ] **Step 1: `src/lib/components/RegionSelector.svelte`を作成する**

```svelte
<script lang="ts">
	let {
		imageUrl,
		canvasWidth,
		canvasHeight,
		onselect
	}: {
		imageUrl: string;
		canvasWidth: number;
		canvasHeight: number;
		onselect: (xywh: [number, number, number, number]) => void;
	} = $props();

	const MIN_DRAG_SIZE = 4;

	let containerEl: HTMLDivElement;
	let dragStart = $state<{ x: number; y: number } | undefined>(undefined);
	let dragCurrent = $state<{ x: number; y: number } | undefined>(undefined);

	const dragRect = $derived(
		dragStart && dragCurrent
			? {
					left: Math.min(dragStart.x, dragCurrent.x),
					top: Math.min(dragStart.y, dragCurrent.y),
					width: Math.abs(dragCurrent.x - dragStart.x),
					height: Math.abs(dragCurrent.y - dragStart.y)
				}
			: undefined
	);

	function toContainerPoint(event: PointerEvent): { x: number; y: number } {
		const rect = containerEl.getBoundingClientRect();
		return {
			x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
			y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
		};
	}

	function handlePointerDown(event: PointerEvent) {
		containerEl.setPointerCapture(event.pointerId);
		dragStart = toContainerPoint(event);
		dragCurrent = dragStart;
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragStart) return;
		dragCurrent = toContainerPoint(event);
	}

	function handlePointerUp() {
		const rect = dragRect;
		dragStart = undefined;
		dragCurrent = undefined;

		if (!rect || rect.width < MIN_DRAG_SIZE || rect.height < MIN_DRAG_SIZE) {
			return;
		}

		const containerRect = containerEl.getBoundingClientRect();
		const scaleX = canvasWidth / containerRect.width;
		const scaleY = canvasHeight / containerRect.height;

		const xywh: [number, number, number, number] = [
			Math.round(rect.left * scaleX),
			Math.round(rect.top * scaleY),
			Math.round(rect.width * scaleX),
			Math.round(rect.height * scaleY)
		];

		onselect(xywh);
	}
</script>

<div
	class="region-selector"
	bind:this={containerEl}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<img src={imageUrl} alt="コメント資料画像" draggable="false" />
	{#if dragRect}
		<div
			class="drag-box"
			style={`left:${dragRect.left}px; top:${dragRect.top}px; width:${dragRect.width}px; height:${dragRect.height}px;`}
		></div>
	{/if}
</div>

<style>
	.region-selector {
		position: relative;
		display: inline-block;
		cursor: crosshair;
		touch-action: none;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 60vh;
		user-select: none;
	}

	.drag-box {
		position: absolute;
		border: 2px solid #e11d48;
		background: rgba(225, 29, 72, 0.15);
		pointer-events: none;
	}
</style>
```

- [ ] **Step 2: `src/routes/editor/+page.svelte`の画像表示を`RegionSelector`に置き換える（動作確認用）**

既存の`{#if selectedCanvas}` ブロック内の `<div class="image-area"><img ... /></div>` を以下に置き換える。

```svelte
{#if selectedCanvas}
	<RegionSelector
		imageUrl={buildDisplayImageUrl(
			selectedCanvas.imageServiceId,
			selectedCanvas.width,
			selectedCanvas.height
		)}
		canvasWidth={selectedCanvas.width}
		canvasHeight={selectedCanvas.height}
		onselect={handleRegionSelect}
	/>
{/if}

{#if lastSelectedRegion}
	<p>選択領域: {lastSelectedRegion.join(', ')}</p>
{/if}
```

`<script>`にimportとハンドラを追加する。

```ts
import RegionSelector from '$lib/components/RegionSelector.svelte';

let lastSelectedRegion = $state<[number, number, number, number] | undefined>(undefined);

function handleRegionSelect(xywh: [number, number, number, number]) {
	lastSelectedRegion = xywh;
}
```

（`lastSelectedRegion`と対応する表示はTask 5で実際のannotationドラフト管理に置き換えられる仮実装。）

- [ ] **Step 3: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 4: ブラウザで動作確認する**

Run: `npm run dev`
ブラウザで `http://localhost:5173/editor/` を開き、Manifest URL（`https://kokusho.nijl.ac.jp/biblio/300136604/manifest`）を読み込み、画像上をドラッグして矩形を描き、離した位置に「選択領域: x, y, w, h」が表示されることを確認する。表示された値がIIIF原画像座標（`selectedCanvas.width`×`height`の範囲内）であることを確認する。

- [ ] **Step 5: commit**

```bash
git add src/lib/components/RegionSelector.svelte src/routes/editor/+page.svelte
git commit -m "feat: Editorにドラッグ矩形選択(xywh取得)を追加"
```

---

## Task 5: Annotationドラフト管理フォーム（複数commentSources・追加/削除）

**Files:**

- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**

- Consumes: `AnnotationSchema`, `Annotation`, `CommentSource`型（`src/lib/annotations/schema.ts`）、`buildCommentImageUrl`（`src/lib/iiif/imageApi.ts`）、Task 3/4のコンポーネント
- Produces: `editor/+page.svelte`内の`annotations: Annotation[]`状態（Task 6/7が読み書きする）

- [ ] **Step 1: `<script>`のstateとimportを整理する**

Task 3のStep 2、Task 4のStep 2で追加した仮実装（`selectedPoint`/`handleMapSelectPoint`はそのまま使う。`lastSelectedRegion`は削除し`draftCommentSources`に置き換える）を含め、`<script>`全体を以下の形に変更する。既存の`handleLoadManifest`/`handleSelectCanvas`はそのまま残し、`manifestId`の設定を追加する。

```ts
import { fetchManifest, ManifestParseError, type ParsedCanvas } from '$lib/iiif/manifest';
import { buildDisplayImageUrl, buildCommentImageUrl } from '$lib/iiif/imageApi';
import ManifestThumbnailStrip from '$lib/components/ManifestThumbnailStrip.svelte';
import RegionSelector from '$lib/components/RegionSelector.svelte';
import EditorMap from '$lib/components/EditorMap.svelte';
import { AnnotationSchema, type Annotation, type CommentSource } from '$lib/annotations/schema';

let manifestUrl = $state('');
let manifestId = $state('');
let canvases = $state<ParsedCanvas[]>([]);
let selectedCanvas = $state<ParsedCanvas | undefined>(undefined);
let loadError = $state<string | undefined>(undefined);
let isLoading = $state(false);

let draftCommentSources = $state<CommentSource[]>([]);
let draftPoint = $state<[number, number] | undefined>(undefined);
let draftLabel = $state('');
let draftDescription = $state('');
let draftError = $state<string | undefined>(undefined);

let annotations = $state<Annotation[]>([]);

async function handleLoadManifest(event: SubmitEvent) {
	event.preventDefault();
	loadError = undefined;
	isLoading = true;
	canvases = [];
	selectedCanvas = undefined;

	try {
		const manifest = await fetchManifest(manifestUrl);
		manifestId = manifest.id;
		canvases = manifest.canvases;
		selectedCanvas = manifest.canvases[0];
	} catch (error) {
		console.error(error);
		loadError =
			error instanceof ManifestParseError ? error.message : 'Manifestを読み込めませんでした。';
	} finally {
		isLoading = false;
	}
}

function handleSelectCanvas(canvas: ParsedCanvas) {
	selectedCanvas = canvas;
}

function handleRegionSelect(xywh: [number, number, number, number]) {
	if (!selectedCanvas) return;
	draftCommentSources = [
		...draftCommentSources,
		{
			manifest: manifestId,
			canvas: selectedCanvas.id,
			imageService: selectedCanvas.imageServiceId,
			xywh
		}
	];
}

function handleRemoveDraftSource(index: number) {
	draftCommentSources = draftCommentSources.filter((_, i) => i !== index);
}

function handleMapSelectPoint(point: [number, number]) {
	draftPoint = point;
}

function handleAddAnnotation(event: SubmitEvent) {
	event.preventDefault();
	draftError = undefined;

	if (draftCommentSources.length === 0) {
		draftError = 'コメント画像領域を1つ以上追加してください。';
		return;
	}
	if (!draftPoint) {
		draftError = '地図上の対象位置を指定してください。';
		return;
	}

	const candidate = {
		id: `annotation-${crypto.randomUUID()}`,
		label: draftLabel,
		description: draftDescription,
		mapTarget: { type: 'point' as const, xy: draftPoint },
		commentSources: draftCommentSources
	};

	const result = AnnotationSchema.safeParse(candidate);
	if (!result.success) {
		draftError = result.error.issues.map((issue) => issue.message).join(' / ');
		return;
	}

	annotations = [...annotations, result.data];

	draftCommentSources = [];
	draftPoint = undefined;
	draftLabel = '';
	draftDescription = '';
}

function handleDeleteAnnotation(id: string) {
	annotations = annotations.filter((annotation) => annotation.id !== id);
}
```

- [ ] **Step 2: テンプレートを変更する**

`{#if selectedCanvas}`のRegionSelectorブロックの直後（Task 4で置いた`{#if lastSelectedRegion}`ブロックは削除）に、ドラフト領域一覧を追加する。

```svelte
{#if draftCommentSources.length > 0}
	<ul class="draft-sources">
		{#each draftCommentSources as source, index}
			<li>
				<img
					src={buildCommentImageUrl(source.imageService, source.xywh)}
					alt={`追加領域 ${index + 1}`}
				/>
				<button type="button" onclick={() => handleRemoveDraftSource(index)}>削除</button>
			</li>
		{/each}
	</ul>
{/if}
```

Task 3のStep 2で追加した`.map-target`セクションの`<EditorMap {selectedPoint} onselectpoint={handleMapSelectPoint} />`を`<EditorMap selectedPoint={draftPoint} onselectpoint={handleMapSelectPoint} />`に変更し、`{#if selectedPoint}`は`{#if draftPoint}`に、表示内容も`draftPoint`を参照するよう変更する（`selectedPoint`という名前のローカル変数はここで`draftPoint`に統合され不要になるため削除する）。

`.map-target`セクションの下に、annotationフォームと一覧を追加する。

```svelte
<form class="annotation-form" onsubmit={handleAddAnnotation}>
	<h2>Annotation</h2>

	<label for="draft-label">Title</label>
	<input id="draft-label" type="text" bind:value={draftLabel} required />

	<label for="draft-description">Description</label>
	<textarea id="draft-description" bind:value={draftDescription}></textarea>

	{#if draftError}
		<p class="error" role="alert">{draftError}</p>
	{/if}

	<button type="submit">Add annotation</button>
</form>

<section class="annotations-list">
	<h2>Annotations ({annotations.length})</h2>
	<ul>
		{#each annotations as annotation (annotation.id)}
			<li>
				<span>{annotation.label}</span>
				<button type="button" onclick={() => handleDeleteAnnotation(annotation.id)}>削除</button>
			</li>
		{/each}
	</ul>
</section>
```

- [ ] **Step 3: CSSを追加する**

`<style>`に追加する。

```css
.draft-sources {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	list-style: none;
	padding: 0;
	margin: 0.5rem 0;
}

.draft-sources li {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
}

.draft-sources img {
	max-width: 160px;
	max-height: 120px;
	object-fit: contain;
	background: #eee;
}

.annotation-form {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	max-width: 480px;
	margin-top: 1rem;
}

.annotations-list ul {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.annotations-list li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}
```

- [ ] **Step 4: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 5: ブラウザで動作確認する**

Run: `npm run dev`
ブラウザで `http://localhost:5173/editor/` を開き、以下を確認する。

1. Manifestを読み込み、画像上で矩形を1つ以上ドラッグ選択→ドラフト領域一覧にサムネイルが表示される。
2. 地図上をクリック→座標が表示される。
3. Titleを入力して「Add annotation」→Annotations一覧に1件追加され、ドラフト領域・座標・フォームがクリアされる。
4. Titleを空のまま「Add annotation」→ブラウザのrequired検証で送信がブロックされる。
5. 領域を追加せずに地図だけクリックして送信→「コメント画像領域を1つ以上追加してください。」エラーが表示される。
6. Annotations一覧の「削除」ボタンで該当annotationが消える。

- [ ] **Step 6: commit**

```bash
git add src/routes/editor/+page.svelte
git commit -m "feat: Editorにannotationドラフト管理フォーム(追加/削除)を実装"
```

---

## Task 6: JSON import/export と保存前バリデーション

**Files:**

- Create: `src/lib/annotations/serialize.ts`
- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**

- Consumes: `AnnotationsFileSchema`, `Annotation`, `AnnotationsFile`型（`src/lib/annotations/schema.ts`）
- Produces:
  - `buildAnnotationsFile(annotations: Annotation[]): AnnotationsFile`
  - `validateAnnotationsFile(candidate: unknown): { valid: true; file: AnnotationsFile } | { valid: false; errors: string[] }`
  - `downloadAnnotationsFile(file: AnnotationsFile, filename?: string): void`
    （Task 7が`validateAnnotationsFile`を復元処理で使う）

- [ ] **Step 1: `src/lib/annotations/serialize.ts`を作成する**

```ts
import { AnnotationsFileSchema, type Annotation, type AnnotationsFile } from './schema';

export function buildAnnotationsFile(annotations: Annotation[]): AnnotationsFile {
	return {
		version: 1,
		map: { georeference: '/data/map-georeference.json' },
		annotations
	};
}

export type ValidateResult =
	{ valid: true; file: AnnotationsFile } | { valid: false; errors: string[] };

export function validateAnnotationsFile(candidate: unknown): ValidateResult {
	const result = AnnotationsFileSchema.safeParse(candidate);
	if (result.success) {
		return { valid: true, file: result.data };
	}
	const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
	return { valid: false, errors };
}

export function downloadAnnotationsFile(
	file: AnnotationsFile,
	filename = 'annotations.json'
): void {
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: `editor/+page.svelte`にimport/exportを追加する**

`<script>`に追加する。

```ts
import {
	buildAnnotationsFile,
	validateAnnotationsFile,
	downloadAnnotationsFile
} from '$lib/annotations/serialize';

let importError = $state<string | undefined>(undefined);
let exportErrors = $state<string[]>([]);

async function handleImportFile(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	importError = undefined;
	try {
		const text = await file.text();
		const json = JSON.parse(text);
		const result = validateAnnotationsFile(json);
		if (!result.valid) {
			importError = result.errors.join(' / ');
			return;
		}
		annotations = result.file.annotations;
	} catch {
		importError = 'JSONファイルを読み込めませんでした。';
	} finally {
		input.value = '';
	}
}

function handleExport() {
	exportErrors = [];
	const candidate = buildAnnotationsFile(annotations);
	const result = validateAnnotationsFile(candidate);
	if (!result.valid) {
		exportErrors = result.errors;
		return;
	}
	downloadAnnotationsFile(result.file);
}
```

- [ ] **Step 3: テンプレートに追加する**

`.annotations-list`セクションの下に追加する。

```svelte
<section class="import-export">
	<h2>Import / Export</h2>

	<label for="import-json">既存のannotations.jsonを読み込む</label>
	<input id="import-json" type="file" accept="application/json" onchange={handleImportFile} />
	{#if importError}
		<p class="error" role="alert">{importError}</p>
	{/if}

	<button type="button" onclick={handleExport}>Export JSON</button>
	{#if exportErrors.length > 0}
		<ul class="error" role="alert">
			{#each exportErrors as error}
				<li>{error}</li>
			{/each}
		</ul>
	{/if}
</section>
```

- [ ] **Step 4: CSSを追加する**

```css
.import-export {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-top: 1rem;
}
```

- [ ] **Step 5: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 6: ブラウザで動作確認する**

Run: `npm run dev`
ブラウザで `http://localhost:5173/editor/` を開き、以下を確認する。

1. annotationを2〜3件作成した状態で「Export JSON」→`annotations.json`がダウンロードされ、内容が`version/map/annotations`を含む正しい形式であることを確認する（ダウンロードしたファイルを開いて確認）。
2. ダウンロードしたファイルを再度「既存のannotations.jsonを読み込む」から選択→Annotations一覧が同じ内容で復元されることを確認する。
3. 意図的に不正なJSON（例: `{"version":1,"map":{},"annotations":[]}`のように`georeference`欠落）を読み込ませ、エラーメッセージが表示されAnnotations一覧が変化しないことを確認する。

- [ ] **Step 7: commit**

```bash
git add src/lib/annotations/serialize.ts src/routes/editor/+page.svelte
git commit -m "feat: EditorにJSON import/exportと保存前バリデーションを実装"
```

---

## Task 7: localStorage自動保存

**Files:**

- Create: `src/lib/annotations/autosave.ts`
- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**

- Consumes: `validateAnnotationsFile`（Task 6）
- Produces: `saveAnnotationsDraft`, `loadAnnotationsDraft`, `clearAnnotationsDraft`

- [ ] **Step 1: `src/lib/annotations/autosave.ts`を作成する**

```ts
const STORAGE_KEY = 'iiif-map-viewer:editor-autosave';

export function saveAnnotationsDraft(annotations: unknown): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
	} catch (error) {
		console.warn('localStorageへの自動保存に失敗しました。', error);
	}
}

export function loadAnnotationsDraft(): unknown | undefined {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : undefined;
	} catch (error) {
		console.warn('localStorageからの復元に失敗しました。', error);
		return undefined;
	}
}

export function clearAnnotationsDraft(): void {
	localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 2: `editor/+page.svelte`に復元処理・保存呼び出し・クリアボタンを追加する**

`<script>`に追加する（`onMount`は新規import）。

```ts
import { onMount } from 'svelte';
import {
	saveAnnotationsDraft,
	loadAnnotationsDraft,
	clearAnnotationsDraft
} from '$lib/annotations/autosave';

let restoredFromDraft = $state(false);

onMount(() => {
	const draft = loadAnnotationsDraft();
	if (draft === undefined) return;

	const result = validateAnnotationsFile({
		version: 1,
		map: { georeference: '/data/map-georeference.json' },
		annotations: draft
	});
	if (result.valid && result.file.annotations.length > 0) {
		annotations = result.file.annotations;
		restoredFromDraft = true;
	}
});

function handleClearDraft() {
	clearAnnotationsDraft();
	annotations = [];
	restoredFromDraft = false;
}
```

`handleAddAnnotation`内、`annotations = [...annotations, result.data];`の直後に`saveAnnotationsDraft(annotations);`を追加する。

`handleDeleteAnnotation`内、`annotations = annotations.filter(...)`の直後に`saveAnnotationsDraft(annotations);`を追加する。

`handleImportFile`内、成功時の`annotations = result.file.annotations;`の直後に`saveAnnotationsDraft(annotations);`を追加する。

（`$effect`による自動保存は使わない。全ページ`prerender = true`のためSSR/ビルド時に`localStorage`へアクセスするとクラッシュする危険があり、明示的なタイミングでの呼び出しの方が安全で挙動も分かりやすいため。）

- [ ] **Step 3: テンプレートに復元表示・クリアボタンを追加する**

`.annotations-list`セクションの`<h2>`の直後に追加する。

```svelte
{#if restoredFromDraft}
	<p role="status">編集中データをlocalStorageから復元しました。</p>
{/if}
```

`.annotations-list`セクションの`</ul>`の下（セクション内の最後）に追加する。

```svelte
<button type="button" onclick={handleClearDraft}>ドラフトをクリア</button>
```

- [ ] **Step 4: 型チェック・lintを実行する**

Run: `npm run check && npm run lint`
Expected: 0エラー。

- [ ] **Step 5: 本番相当ビルドで`prerender`時にクラッシュしないことを確認する**

Run: `npm run build`
Expected: ビルドが正常終了する（`localStorage is not defined`のようなエラーが出ないことを確認する）。

- [ ] **Step 6: ブラウザで動作確認する**

Run: `npm run dev`
ブラウザで `http://localhost:5173/editor/` を開き、以下を確認する。

1. annotationを1件作成→ページをリロード→「編集中データをlocalStorageから復元しました。」が表示され、Annotations一覧に先ほどの1件が残っていることを確認する。
2. 「ドラフトをクリア」→一覧が空になり、リロードしても復元されないことを確認する。
3. ブラウザのDevToolsでlocalStorageの`iiif-map-viewer:editor-autosave`キーの値を確認し、JSON配列が保存されていることを確認する。

- [ ] **Step 7: commit**

```bash
git add src/lib/annotations/autosave.ts src/routes/editor/+page.svelte
git commit -m "feat: EditorにlocalStorage自動保存・復元を実装"
```

---

## Task完了後の後片付け

全タスク完了後、PROCESS.mdのPhase3チェックリストをすべて`[x]`に更新し、完了条件の記述を追加する（Phase1/Phase2の記述パターンに合わせる）。この更新は最後のタスクのcommitに含めるか、別途小さなcommitとして行う。
