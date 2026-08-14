<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchManifest, ManifestParseError, type ParsedCanvas } from '$lib/iiif/manifest';
	import { buildDisplayImageUrl, buildCommentImageUrl } from '$lib/iiif/imageApi';
	import ManifestThumbnailStrip from '$lib/components/ManifestThumbnailStrip.svelte';
	import RegionSelector from '$lib/components/RegionSelector.svelte';
	import EditorMap from '$lib/components/EditorMap.svelte';
	import { AnnotationSchema, type Annotation, type CommentSource } from '$lib/annotations/schema';
	import {
		buildAnnotationsFile,
		validateAnnotationsFile,
		downloadAnnotationsFile
	} from '$lib/annotations/serialize';
	import {
		saveAnnotationsDraft,
		loadAnnotationsDraft,
		clearAnnotationsDraft
	} from '$lib/annotations/autosave';

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
	let editingAnnotationId = $state<string | undefined>(undefined);

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

	function resetDraft() {
		draftCommentSources = [];
		draftPoint = undefined;
		draftLabel = '';
		draftDescription = '';
		editingAnnotationId = undefined;
	}

	function handleEditAnnotation(annotation: Annotation) {
		draftLabel = annotation.label;
		draftDescription = annotation.description;
		draftPoint = annotation.mapTarget.type === 'point' ? annotation.mapTarget.xy : undefined;
		draftCommentSources = annotation.commentSources;
		editingAnnotationId = annotation.id;
		draftError = undefined;
	}

	function handleCancelEdit() {
		resetDraft();
		draftError = undefined;
	}

	function handleSubmitAnnotation(event: SubmitEvent) {
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
			id: editingAnnotationId ?? `annotation-${crypto.randomUUID()}`,
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

		if (editingAnnotationId) {
			const targetId = editingAnnotationId;
			annotations = annotations.map((annotation) =>
				annotation.id === targetId ? result.data : annotation
			);
		} else {
			annotations = [...annotations, result.data];
		}
		saveAnnotationsDraft(annotations);

		resetDraft();
	}

	function handleDeleteAnnotation(id: string) {
		annotations = annotations.filter((annotation) => annotation.id !== id);
		saveAnnotationsDraft(annotations);
		if (editingAnnotationId === id) {
			resetDraft();
		}
	}

	function handleMoveAnnotation(index: number, direction: -1 | 1) {
		const targetIndex = index + direction;
		if (targetIndex < 0 || targetIndex >= annotations.length) return;
		const next = [...annotations];
		[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
		annotations = next;
		saveAnnotationsDraft(annotations);
	}

	let importError = $state<string | undefined>(undefined);
	let exportErrors = $state<string[]>([]);

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
			saveAnnotationsDraft(annotations);
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
</script>

<div class="editor">
	<section class="comment-resource">
		<h2>Comment Resource</h2>

		<form onsubmit={handleLoadManifest}>
			<label for="manifest-url">Manifest URL</label>
			<input id="manifest-url" type="url" bind:value={manifestUrl} required />
			<button type="submit" class="primary" disabled={isLoading}>読み込み</button>
		</form>

		{#if isLoading}
			<p role="status">読み込み中…</p>
		{/if}

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

		{#if draftCommentSources.length > 0}
			<ul class="draft-sources">
				{#each draftCommentSources as source, index (index)}
					<li>
						<img
							src={buildCommentImageUrl(source.imageService, source.xywh)}
							alt={`追加領域 ${index + 1}`}
						/>
						<button type="button" class="danger" onclick={() => handleRemoveDraftSource(index)}
							>削除</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="map-target">
		<h2>Map</h2>
		<div class="map-area">
			<EditorMap selectedPoint={draftPoint} onselectpoint={handleMapSelectPoint} />
		</div>
		{#if draftPoint}
			<p>選択中の座標: {draftPoint[0].toFixed(1)}, {draftPoint[1].toFixed(1)}</p>
		{/if}
	</section>

	<form class="annotation-form" onsubmit={handleSubmitAnnotation}>
		<h2>{editingAnnotationId ? 'Edit Annotation' : 'Annotation'}</h2>

		<label for="draft-label">Title</label>
		<input id="draft-label" type="text" bind:value={draftLabel} required />

		<label for="draft-description">Description</label>
		<textarea id="draft-description" bind:value={draftDescription}></textarea>

		{#if draftError}
			<p class="error" role="alert">{draftError}</p>
		{/if}

		<div class="form-actions">
			<button type="submit" class="primary"
				>{editingAnnotationId ? 'Update annotation' : 'Add annotation'}</button
			>
			{#if editingAnnotationId}
				<button type="button" class="secondary" onclick={handleCancelEdit}>キャンセル</button>
			{/if}
		</div>
	</form>

	<section class="annotations-list">
		<h2>Annotations ({annotations.length})</h2>
		<p class="hint">
			ここでの編集内容はブラウザのlocalStorageに一時保存されます（正式データではありません）。作業を確定するには「Export
			JSON」でダウンロードし、`static/data/annotations.json` として保存してください。
		</p>
		{#if restoredFromDraft}
			<p role="status">編集中データをlocalStorageから復元しました。</p>
		{/if}
		<ul>
			{#each annotations as annotation, index (annotation.id)}
				<li class:editing={annotation.id === editingAnnotationId}>
					<span>{annotation.label}</span>
					<div class="item-actions">
						<button
							type="button"
							class="secondary"
							onclick={() => handleMoveAnnotation(index, -1)}
							disabled={index === 0}
							aria-label="上へ移動"
						>
							↑
						</button>
						<button
							type="button"
							class="secondary"
							onclick={() => handleMoveAnnotation(index, 1)}
							disabled={index === annotations.length - 1}
							aria-label="下へ移動"
						>
							↓
						</button>
						<button type="button" class="secondary" onclick={() => handleEditAnnotation(annotation)}
							>編集</button
						>
						<button
							type="button"
							class="danger"
							onclick={() => handleDeleteAnnotation(annotation.id)}
						>
							削除
						</button>
					</div>
				</li>
			{/each}
		</ul>
		<button type="button" class="danger" onclick={handleClearDraft}>ドラフトをクリア</button>
	</section>

	<section class="import-export">
		<h2>Import / Export</h2>

		<label for="import-json">既存のannotations.jsonを読み込む</label>
		<input id="import-json" type="file" accept="application/json" onchange={handleImportFile} />
		{#if importError}
			<p class="error" role="alert">{importError}</p>
		{/if}

		<button type="button" class="primary" onclick={handleExport}>Export JSON</button>
		{#if exportErrors.length > 0}
			<ul class="error" role="alert">
				{#each exportErrors as error, index (index)}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.editor {
		--color-bg: #eef2f0;
		--color-surface: #ffffff;
		--color-border: #d7deda;
		--color-ink: #1f2b26;
		--color-accent: #2b6e63;
		--color-accent-hover: #21544b;
		--color-muted: #5c6b65;
		--color-danger: #b3261e;
		--color-danger-bg: #fbeaea;
		--color-highlight: #fce7a2;

		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-height: 100vh;
		padding: 2rem;
		box-sizing: border-box;
		background: var(--color-bg);
		color: var(--color-ink);
		font-family:
			ui-sans-serif,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	.comment-resource,
	.map-target,
	.annotation-form,
	.annotations-list,
	.import-export {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.annotation-form {
		max-width: 560px;
	}

	.comment-resource h2,
	.map-target h2,
	.annotation-form h2,
	.annotations-list h2,
	.import-export h2 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		font-family: ui-serif, Georgia, serif;
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.comment-resource h2::before,
	.map-target h2::before,
	.annotation-form h2::before,
	.annotations-list h2::before,
	.import-export h2::before {
		content: '';
		display: inline-block;
		width: 10px;
		height: 10px;
		flex-shrink: 0;
		background: var(--color-accent);
		border: 1px solid var(--color-accent-hover);
	}

	form {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	input[type='text'],
	input[type='url'],
	textarea {
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-ink);
	}

	input:focus,
	textarea:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
		border-color: var(--color-accent);
	}

	button {
		font-family: inherit;
		font-size: 0.9rem;
		border-radius: 4px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-ink);
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	button:hover:not(:disabled) {
		border-color: var(--color-accent);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.primary {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: #fff;
	}

	button.primary:hover:not(:disabled) {
		background: var(--color-accent-hover);
		border-color: var(--color-accent-hover);
	}

	button.danger {
		background: transparent;
		border-color: var(--color-danger);
		color: var(--color-danger);
	}

	button.danger:hover:not(:disabled) {
		background: var(--color-danger-bg);
	}

	.error {
		color: var(--color-danger);
		background: var(--color-danger-bg);
		border: 1px solid var(--color-danger);
		padding: 0.5rem 0.9rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.hint {
		color: var(--color-muted);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.map-area {
		height: 400px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		overflow: hidden;
	}

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
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 4px;
	}

	.annotation-form input + label {
		margin-top: 0.75rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.annotations-list ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.annotations-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.25rem;
		border-bottom: 1px solid var(--color-border);
	}

	.annotations-list li:last-child {
		border-bottom: none;
	}

	.annotations-list li.editing {
		background: var(--color-highlight);
		border-radius: 4px;
		padding-left: 0.5rem;
	}

	.item-actions {
		display: flex;
		gap: 0.25rem;
	}

	.item-actions button {
		padding: 0.3rem 0.6rem;
		font-size: 0.8rem;
	}

	.import-export > button,
	.annotations-list > button {
		align-self: flex-start;
	}
</style>
