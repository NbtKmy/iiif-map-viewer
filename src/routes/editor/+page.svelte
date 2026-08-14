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
			<button type="submit" disabled={isLoading}>読み込み</button>
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
						<button type="button" onclick={() => handleRemoveDraftSource(index)}>削除</button>
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
			<button type="submit">{editingAnnotationId ? 'Update annotation' : 'Add annotation'}</button>
			{#if editingAnnotationId}
				<button type="button" onclick={handleCancelEdit}>キャンセル</button>
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
							onclick={() => handleMoveAnnotation(index, -1)}
							disabled={index === 0}
							aria-label="上へ移動"
						>
							↑
						</button>
						<button
							type="button"
							onclick={() => handleMoveAnnotation(index, 1)}
							disabled={index === annotations.length - 1}
							aria-label="下へ移動"
						>
							↓
						</button>
						<button type="button" onclick={() => handleEditAnnotation(annotation)}>編集</button>
						<button type="button" onclick={() => handleDeleteAnnotation(annotation.id)}>
							削除
						</button>
					</div>
				</li>
			{/each}
		</ul>
		<button type="button" onclick={handleClearDraft}>ドラフトをクリア</button>
	</section>

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
				{#each exportErrors as error, index (index)}
					<li>{error}</li>
				{/each}
			</ul>
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

	.error {
		color: #900;
		background: #fee;
		padding: 0.5rem 1rem;
		border-radius: 4px;
	}

	.hint {
		color: #555;
		font-size: 0.875rem;
	}

	.map-target {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.map-area {
		height: 400px;
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
		background: #eee;
	}

	.annotation-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 480px;
		margin-top: 1rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
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
		padding: 0.25rem 0.5rem;
	}

	.annotations-list li.editing {
		background: #fff3cd;
		border-radius: 4px;
	}

	.item-actions {
		display: flex;
		gap: 0.25rem;
	}

	.import-export {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
