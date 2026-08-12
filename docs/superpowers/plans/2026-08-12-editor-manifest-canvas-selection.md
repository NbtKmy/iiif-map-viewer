# Editor: Manifest入力によるCanvas選択 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor（`/editor/`）に、IIIF Manifest URLを入力するとCanvas一覧がサムネイルストリップとして表示され、クリックでページを選び、メイン画像エリアに全体画像を表示できる機能を作る。

**Architecture:** `src/lib/iiif/` にIIIF Image API URL生成とManifestパース（Presentation API 2.0専用、手動型ガード）を切り出し、`src/lib/components/ManifestThumbnailStrip.svelte` でサムネイルUIを構成、`src/routes/editor/+page.svelte` で全体を統合する。

**Tech Stack:** SvelteKit（Svelte 5 runes: `$state`/`$props`）、TypeScript、標準`fetch`。新規ライブラリ追加なし。

## Global Constraints

- テスト方針（CLAUDE.md）: vitest等の自動テストランナーは導入しない。各タスクの検証は `npm run check`（型チェック）・`npm run lint`（ESLint+Prettier）、および挙動確認が必要なタスクはPlaywrightで実際にブラウザを起動して確認する。ロジック関数の動作確認は一時スクリプト（`/tmp/` 配下、コミットしない）でconsole.assertする。
- Manifest対応範囲（DESIGN.md §8.2）: IIIF Presentation API 2.0のみ（`sequences[].canvases[].images[].resource.service`構造）。3.0は対象外。
- サムネイルは物理ファイルを生成しない。IIIF Image APIのURLを都度生成する（DESIGN.md §21.1）。
- パッケージマネージャ: npm。新規依存パッケージは追加しない（既存の`maplibre-gl`/`@allmaps/*`/`zod`のみ、今回は使わない）。
- 対象マニフェスト（動作確認に使う実データ）: `https://kokusho.nijl.ac.jp/biblio/300136604/manifest`。4 Canvas、各Canvasの`images[0].resource.service['@id']`がIIIF Image Service ID。CORSは確認済み（`Access-Control-Allow-Origin: *`）。
- コンポーネントはSvelte 5 runes構文を使う（このプロジェクトの既存 `src/routes/+page.svelte` と同じスタイル）。
- アクセシビリティ（DESIGN.md §16）: サムネイルは`button`要素、`alt`属性でページラベルを設定する。

---

### Task 1: IIIF Image API URLビルダー

**Files:**

- Create: `src/lib/iiif/imageApi.ts`

**Interfaces:**

- Consumes: なし（このタスクが最初）
- Produces:
  - `buildImageUrl(imageServiceId: string, options?: { region?: string; size?: string }): string`
  - `buildThumbnailUrl(imageServiceId: string, maxHeight?: number): string`
  - `buildFullImageUrl(imageServiceId: string): string`

- [ ] **Step 1: `src/lib/iiif/imageApi.ts` を実装**

```ts
export function buildImageUrl(
	imageServiceId: string,
	options: { region?: string; size?: string } = {}
): string {
	const region = options.region ?? 'full';
	const size = options.size ?? 'full';
	return `${imageServiceId}/${region}/${size}/0/default.jpg`;
}

export function buildThumbnailUrl(imageServiceId: string, maxHeight = 150): string {
	return buildImageUrl(imageServiceId, { size: `,${maxHeight}` });
}

export function buildFullImageUrl(imageServiceId: string): string {
	return buildImageUrl(imageServiceId);
}
```

- [ ] **Step 2: 一時スクリプトで出力を確認**

`/tmp/check-image-api.mjs` を作成:

```js
function buildImageUrl(imageServiceId, options = {}) {
	const region = options.region ?? 'full';
	const size = options.size ?? 'full';
	return `${imageServiceId}/${region}/${size}/0/default.jpg`;
}
function buildThumbnailUrl(imageServiceId, maxHeight = 150) {
	return buildImageUrl(imageServiceId, { size: `,${maxHeight}` });
}
function buildFullImageUrl(imageServiceId) {
	return buildImageUrl(imageServiceId);
}

const serviceId =
	'https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00001.tif';

console.assert(
	buildFullImageUrl(serviceId) === `${serviceId}/full/full/0/default.jpg`,
	'buildFullImageUrl mismatch'
);
console.assert(
	buildThumbnailUrl(serviceId, 150) === `${serviceId}/full/,150/0/default.jpg`,
	'buildThumbnailUrl mismatch'
);
console.log('OK: all assertions passed');
```

Run: `node /tmp/check-image-api.mjs`
Expected: `OK: all assertions passed`（`console.assert`は失敗時のみ出力するため、失敗時は`Assertion failed: ...`が出る）

- [ ] **Step 3: 型チェックとlint**

Run: `npm run check && npm run lint`
Expected: 両方エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/lib/iiif/imageApi.ts
git commit -m "feat: add IIIF Image API URL builder"
```

---

### Task 2: Manifestフェッチ・パース（Presentation API 2.0）

**Files:**

- Create: `src/lib/iiif/manifest.ts`

**Interfaces:**

- Consumes: なし（Task 1とは独立、`imageApi.ts`は使わない）
- Produces:
  - `type ParsedCanvas = { id: string; label: string; width: number; height: number; imageServiceId: string }`
  - `type ParsedManifest = { id: string; label: string; canvases: ParsedCanvas[] }`
  - `class ManifestParseError extends Error {}`
  - `parseManifest(json: unknown): ParsedManifest` — 純粋関数、Presentation 2.0構造でなければ`ManifestParseError`を投げる
  - `fetchManifest(url: string): Promise<ParsedManifest>` — `fetch`して`parseManifest`に渡す。HTTPエラー時も`ManifestParseError`を投げる

- [ ] **Step 1: `src/lib/iiif/manifest.ts` を実装**

```ts
export type ParsedCanvas = {
	id: string;
	label: string;
	width: number;
	height: number;
	imageServiceId: string;
};

export type ParsedManifest = {
	id: string;
	label: string;
	canvases: ParsedCanvas[];
};

export class ManifestParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function hasPresentation2Context(context: unknown): boolean {
	if (typeof context === 'string') {
		return context.includes('presentation/2/context.json');
	}
	if (Array.isArray(context)) {
		return context.some(
			(entry) => typeof entry === 'string' && entry.includes('presentation/2/context.json')
		);
	}
	return false;
}

function parseCanvas(canvas: unknown): ParsedCanvas | null {
	if (!isRecord(canvas)) return null;

	const id = canvas['@id'];
	const width = canvas['width'];
	const height = canvas['height'];
	if (typeof id !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
		return null;
	}

	const images = canvas['images'];
	if (!Array.isArray(images) || images.length === 0) return null;

	const firstImage = images[0];
	if (!isRecord(firstImage)) return null;

	const resource = firstImage['resource'];
	if (!isRecord(resource)) return null;

	const service = resource['service'];
	const imageServiceId = isRecord(service) ? service['@id'] : undefined;
	if (typeof imageServiceId !== 'string') return null;

	const label = typeof canvas['label'] === 'string' ? canvas['label'] : id;

	return { id, label, width, height, imageServiceId };
}

export function parseManifest(json: unknown): ParsedManifest {
	if (!isRecord(json)) {
		throw new ManifestParseError('Manifestの形式が不正です。');
	}

	if (!hasPresentation2Context(json['@context'])) {
		throw new ManifestParseError('このManifestはIIIF Presentation API 2.0形式ではありません。');
	}

	const sequences = json['sequences'];
	if (!Array.isArray(sequences) || sequences.length === 0) {
		throw new ManifestParseError('Manifestにsequencesが含まれていません。');
	}

	const firstSequence = sequences[0];
	const rawCanvases = isRecord(firstSequence) ? firstSequence['canvases'] : undefined;
	if (!Array.isArray(rawCanvases)) {
		throw new ManifestParseError('Manifestにcanvasesが含まれていません。');
	}

	const canvases = rawCanvases
		.map(parseCanvas)
		.filter((canvas): canvas is ParsedCanvas => canvas !== null);

	if (canvases.length === 0) {
		throw new ManifestParseError('Manifestに有効なCanvasが含まれていません。');
	}

	return {
		id: typeof json['@id'] === 'string' ? json['@id'] : '',
		label: typeof json['label'] === 'string' ? json['label'] : '',
		canvases
	};
}

export async function fetchManifest(url: string): Promise<ParsedManifest> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new ManifestParseError('Manifestを取得できませんでした（ネットワークエラー）。');
	}

	if (!response.ok) {
		throw new ManifestParseError(`Manifestを取得できませんでした（HTTP ${response.status}）。`);
	}

	const json = await response.json();
	return parseManifest(json);
}
```

- [ ] **Step 2: 一時スクリプトで実データをパースして確認**

`/tmp/check-manifest.mjs` を作成（`parseManifest`のロジックをそのまま貼り付けて確認する。実装ファイルを直接importせず、貼り付けるのはNode ESMとSvelteKitの`$lib`エイリアス解決が食い違うため。確認専用のため許容する）:

```js
const manifestJson = await fetch('https://kokusho.nijl.ac.jp/biblio/300136604/manifest').then((r) =>
	r.json()
);

// --- parseManifest本体をここに貼り付け（Step 1と同一実装） ---
function isRecord(value) {
	return typeof value === 'object' && value !== null;
}
function hasPresentation2Context(context) {
	if (typeof context === 'string') return context.includes('presentation/2/context.json');
	if (Array.isArray(context))
		return context.some((e) => typeof e === 'string' && e.includes('presentation/2/context.json'));
	return false;
}
function parseCanvas(canvas) {
	if (!isRecord(canvas)) return null;
	const id = canvas['@id'];
	const width = canvas['width'];
	const height = canvas['height'];
	if (typeof id !== 'string' || typeof width !== 'number' || typeof height !== 'number')
		return null;
	const images = canvas['images'];
	if (!Array.isArray(images) || images.length === 0) return null;
	const firstImage = images[0];
	if (!isRecord(firstImage)) return null;
	const resource = firstImage['resource'];
	if (!isRecord(resource)) return null;
	const service = resource['service'];
	const imageServiceId = isRecord(service) ? service['@id'] : undefined;
	if (typeof imageServiceId !== 'string') return null;
	const label = typeof canvas['label'] === 'string' ? canvas['label'] : id;
	return { id, label, width, height, imageServiceId };
}
function parseManifest(json) {
	if (!isRecord(json)) throw new Error('invalid');
	if (!hasPresentation2Context(json['@context'])) throw new Error('not presentation 2.0');
	const sequences = json['sequences'];
	if (!Array.isArray(sequences) || sequences.length === 0) throw new Error('no sequences');
	const firstSequence = sequences[0];
	const rawCanvases = isRecord(firstSequence) ? firstSequence['canvases'] : undefined;
	if (!Array.isArray(rawCanvases)) throw new Error('no canvases');
	const canvases = rawCanvases.map(parseCanvas).filter((c) => c !== null);
	if (canvases.length === 0) throw new Error('no valid canvases');
	return {
		id: typeof json['@id'] === 'string' ? json['@id'] : '',
		label: typeof json['label'] === 'string' ? json['label'] : '',
		canvases
	};
}
// --- ここまで ---

const result = parseManifest(manifestJson);
console.assert(result.canvases.length === 4, `expected 4 canvases, got ${result.canvases.length}`);
console.assert(
	result.canvases[0].label === '1',
	`expected first label "1", got ${result.canvases[0].label}`
);
console.assert(
	result.canvases[0].imageServiceId ===
		'https://kokusho.nijl.ac.jp/api/iiif/300136604/v4/UZHL/UZHL-50005/UZHL-50005-00001.tif',
	'unexpected imageServiceId for canvas 0'
);

// 異常系: sequencesがないケース
try {
	parseManifest({ '@context': 'http://iiif.io/api/presentation/2/context.json' });
	console.assert(false, 'expected throw for missing sequences');
} catch (e) {
	console.assert(e.message === 'no sequences', `unexpected error: ${e.message}`);
}

console.log('OK: all assertions passed');
```

Run: `node /tmp/check-manifest.mjs`
Expected: `OK: all assertions passed`

- [ ] **Step 3: 型チェックとlint**

Run: `npm run check && npm run lint`
Expected: 両方エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/lib/iiif/manifest.ts
git commit -m "feat: add IIIF Presentation API 2.0 manifest parser"
```

---

### Task 3: サムネイルストリップコンポーネント

**Files:**

- Create: `src/lib/components/ManifestThumbnailStrip.svelte`

**Interfaces:**

- Consumes:
  - `ParsedCanvas` type from `$lib/iiif/manifest`（Task 2）
  - `buildThumbnailUrl(imageServiceId: string, maxHeight?: number): string` from `$lib/iiif/imageApi`（Task 1）
- Produces: Svelteコンポーネント。Props: `canvases: ParsedCanvas[]`, `selectedCanvasId: string | undefined`, `onselect: (canvas: ParsedCanvas) => void`

- [ ] **Step 1: `src/lib/components/ManifestThumbnailStrip.svelte` を実装**

```svelte
<script lang="ts">
	import type { ParsedCanvas } from '$lib/iiif/manifest';
	import { buildThumbnailUrl } from '$lib/iiif/imageApi';

	let {
		canvases,
		selectedCanvasId,
		onselect
	}: {
		canvases: ParsedCanvas[];
		selectedCanvasId: string | undefined;
		onselect: (canvas: ParsedCanvas) => void;
	} = $props();
</script>

<div class="thumbnail-strip" role="tablist" aria-label="ページ選択">
	{#each canvases as canvas (canvas.id)}
		<button
			type="button"
			role="tab"
			aria-selected={canvas.id === selectedCanvasId}
			class:selected={canvas.id === selectedCanvasId}
			onclick={() => onselect(canvas)}
		>
			<img
				src={buildThumbnailUrl(canvas.imageServiceId)}
				alt={`ページ ${canvas.label}`}
				loading="lazy"
			/>
			<span class="label">{canvas.label}</span>
		</button>
	{/each}
</div>

<style>
	.thumbnail-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 0.5rem;
	}

	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 2px solid transparent;
		background: none;
		cursor: pointer;
		border-radius: 4px;
		flex-shrink: 0;
	}

	button.selected {
		border-color: #2563eb;
	}

	img {
		height: 80px;
		width: auto;
		object-fit: contain;
		background: #eee;
	}

	.label {
		font-size: 0.75rem;
	}
</style>
```

- [ ] **Step 2: 型チェックとlint**

Run: `npm run check && npm run lint`
Expected: 両方エラーなし（このコンポーネント単体の見た目確認はTask 4のEditorページ統合時にPlaywrightで行う）

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ManifestThumbnailStrip.svelte
git commit -m "feat: add manifest thumbnail strip component"
```

---

### Task 4: Editorページ統合

**Files:**

- Create: `src/routes/editor/+page.svelte`
- Modify: `PROCESS.md`（Phase 3のチェックリスト更新）

**Interfaces:**

- Consumes:
  - `fetchManifest`, `ManifestParseError`, `ParsedCanvas` from `$lib/iiif/manifest`（Task 2）
  - `buildFullImageUrl` from `$lib/iiif/imageApi`（Task 1）
  - `ManifestThumbnailStrip` component from `$lib/components/ManifestThumbnailStrip.svelte`（Task 3）
- Produces: `/editor/` ルートページ（このタスクが最終消費者、後続タスクなし）

- [ ] **Step 1: `src/routes/editor/+page.svelte` を実装**

```svelte
<script lang="ts">
	import { fetchManifest, ManifestParseError, type ParsedCanvas } from '$lib/iiif/manifest';
	import { buildFullImageUrl } from '$lib/iiif/imageApi';
	import ManifestThumbnailStrip from '$lib/components/ManifestThumbnailStrip.svelte';

	let manifestUrl = $state('');
	let canvases = $state<ParsedCanvas[]>([]);
	let selectedCanvas = $state<ParsedCanvas | undefined>(undefined);
	let loadError = $state<string | undefined>(undefined);
	let isLoading = $state(false);

	async function handleLoadManifest(event: SubmitEvent) {
		event.preventDefault();
		loadError = undefined;
		isLoading = true;
		canvases = [];
		selectedCanvas = undefined;

		try {
			const manifest = await fetchManifest(manifestUrl);
			canvases = manifest.canvases;
			selectedCanvas = manifest.canvases[0];
		} catch (error) {
			loadError =
				error instanceof ManifestParseError ? error.message : 'Manifestを読み込めませんでした。';
		} finally {
			isLoading = false;
		}
	}

	function handleSelectCanvas(canvas: ParsedCanvas) {
		selectedCanvas = canvas;
	}
</script>

<div class="editor">
	<section class="comment-resource">
		<h2>Comment Resource</h2>

		<form onsubmit={handleLoadManifest}>
			<label for="manifest-url">Manifest URL</label>
			<input id="manifest-url" type="url" bind:value={manifestUrl} required />
			<button type="submit" disabled={isLoading}>読み込み</button>
		</form>

		{#if loadError}
			<p class="error" role="alert">{loadError}</p>
		{/if}

		{#if canvases.length > 0}
			<ManifestThumbnailStrip
				{canvases}
				selectedCanvasId={selectedCanvas?.id}
				onselect={handleSelectCanvas}
			/>
		{/if}

		{#if selectedCanvas}
			<div class="image-area">
				<img
					src={buildFullImageUrl(selectedCanvas.imageServiceId)}
					alt={`ページ ${selectedCanvas.label}`}
				/>
			</div>
		{/if}
	</section>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 1rem;
		box-sizing: border-box;
	}

	.comment-resource {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.image-area img {
		max-width: 100%;
		max-height: 60vh;
		object-fit: contain;
	}

	.error {
		color: #900;
		background: #fee;
		padding: 0.5rem 1rem;
		border-radius: 4px;
	}
</style>
```

Note: ルートの `src/routes/+layout.ts`（`export const prerender = true`）は`/editor/`にも継承されるため、追加のprerender設定は不要。

- [ ] **Step 2: devサーバーを起動**

```bash
lsof -ti:5183 -sTCP:LISTEN | xargs -r kill
npm run dev -- --port 5183 > /tmp/dev.log 2>&1 &
disown
for i in $(seq 1 15); do curl -sf http://localhost:5183/editor/ >/dev/null 2>&1 && echo "server up" && break; sleep 1; done
```

Expected: `server up`

- [ ] **Step 3: Playwrightで実際にManifestを読み込んで確認**

一時ディレクトリにPlaywrightをセットアップ済みでなければ:

```bash
mkdir -p /tmp/pw-check && cd /tmp/pw-check && npm init -y >/dev/null 2>&1 && npm install playwright >/dev/null 2>&1 && npx playwright install chromium >/dev/null 2>&1
```

`/tmp/pw-check/check-editor.js` を作成:

```js
const { chromium } = require('playwright');

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	page.on('pageerror', (err) => errors.push(err.message));

	await page.goto('http://localhost:5183/editor/', { waitUntil: 'networkidle' });
	await page.fill('#manifest-url', 'https://kokusho.nijl.ac.jp/biblio/300136604/manifest');
	await page.click('button[type="submit"]');
	await page.waitForSelector('.thumbnail-strip button', { timeout: 15000 });

	const thumbCount = await page.locator('.thumbnail-strip button').count();
	console.assert(thumbCount === 4, `expected 4 thumbnails, got ${thumbCount}`);

	const selectedLabel = await page.locator('.thumbnail-strip button.selected .label').textContent();
	console.assert(selectedLabel === '1', `expected page 1 auto-selected, got ${selectedLabel}`);

	await page.screenshot({ path: '/tmp/pw-check/editor-page1.png' });

	// 2ページ目をクリック
	await page.locator('.thumbnail-strip button').nth(1).click();
	await page.waitForTimeout(1000);
	const newSelectedLabel = await page
		.locator('.thumbnail-strip button.selected .label')
		.textContent();
	console.assert(newSelectedLabel === '2', `expected page 2 selected, got ${newSelectedLabel}`);

	await page.screenshot({ path: '/tmp/pw-check/editor-page2.png' });

	console.log('--- page errors ---');
	console.log(errors.join('\n') || '(none)');
	console.log('OK: all assertions passed');

	await browser.close();
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

Run: `cd /tmp/pw-check && node check-editor.js`
Expected: `OK: all assertions passed`、`(none)`（pageerrorなし）

- [ ] **Step 4: スクリーンショットを目視確認**

Read `/tmp/pw-check/editor-page1.png` と `/tmp/pw-check/editor-page2.png` を確認する。

Expected:

- `editor-page1.png`: サムネイル4枚が横に並び、1枚目（ページ1）が枠線でハイライトされ、メイン画像エリアに1ページ目の全体画像が表示されている
- `editor-page2.png`: 2枚目（ページ2）がハイライトされ、メイン画像エリアの画像が2ページ目に切り替わっている

- [ ] **Step 5: devサーバーとPlaywright確認用ファイルを片付ける**

```bash
lsof -ti:5183 -sTCP:LISTEN | xargs -r kill
rm -rf /tmp/pw-check /tmp/dev.log /tmp/check-image-api.mjs /tmp/check-manifest.mjs
```

- [ ] **Step 6: `npm run check && npm run lint` を実行**

Expected: 両方エラーなし

- [ ] **Step 7: `PROCESS.md` のPhase 3チェックリストを更新**

`PROCESS.md`のPhase 3セクション内、以下の行:

```
- [ ] `/editor/` ルート作成
- [ ] IIIF Image Service URL入力→画像表示
```

を次のように書き換える:

```
- [x] `/editor/` ルート作成
- [x] IIIF Manifest URL入力→Canvas一覧サムネイル表示→選択→画像表示（IIIF Image Service URL直接入力は§8.2改訂によりMVPスコープから除外）
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/editor/+page.svelte PROCESS.md
git commit -m "feat: implement Editor manifest input and canvas selection"
git push
```

---

## Self-Review Notes

- **Spec coverage:** DESIGN.md §8.1（レイアウト）→ Task 4のマークアップ構成。§8.2（Manifest入力・自動選択・エラー処理・ドラフトクリア）→ Task 2のエラー分岐 + Task 4の`handleLoadManifest`（新規読み込み時に`selectedCanvas`をリセットすることでドラフトクリアの原則を満たす）。§21.1（サムネイルは動的生成、物理ファイル生成なし）→ Task 1の`buildThumbnailUrl`。§16（アクセシビリティ）→ Task 3の`button`/`alt`。CORS確認済みの事実 → Task 4 Step 3で実際に外部Manifestへ疎通確認。
- **Placeholder scan:** なし。全タスクに実コード・実行コマンド・期待結果を明記済み。
- **Type consistency:** `ParsedCanvas`/`ParsedManifest`/`ManifestParseError`（Task 2）を Task 3・Task 4がそのまま `$lib/iiif/manifest` からimportして使用。`buildThumbnailUrl`/`buildFullImageUrl`（Task 1）をTask 3・Task 4がそのまま使用。命名の揺れなし。
- **スコープ境界:** 矩形ドラッグ選択（§8.3）、地図Point指定（§8.4）、Annotation追加/削除、JSON import/export、localStorage autosaveは今回のDESIGN.md変更（§8.1/8.2のみ）の対象外。後続の別計画で扱う。
