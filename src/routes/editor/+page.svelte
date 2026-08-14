<script lang="ts">
	import { fetchManifest, ManifestParseError, type ParsedCanvas } from '$lib/iiif/manifest';
	import { buildDisplayImageUrl } from '$lib/iiif/imageApi';
	import ManifestThumbnailStrip from '$lib/components/ManifestThumbnailStrip.svelte';
	import EditorMap from '$lib/components/EditorMap.svelte';
	import RegionSelector from '$lib/components/RegionSelector.svelte';

	let lastSelectedRegion = $state<[number, number, number, number] | undefined>(undefined);

	function handleRegionSelect(xywh: [number, number, number, number]) {
		lastSelectedRegion = xywh;
	}

	let manifestUrl = $state('');
	let canvases = $state<ParsedCanvas[]>([]);
	let selectedCanvas = $state<ParsedCanvas | undefined>(undefined);
	let loadError = $state<string | undefined>(undefined);
	let isLoading = $state(false);

	let selectedPoint = $state<[number, number] | undefined>(undefined);

	function handleMapSelectPoint(point: [number, number]) {
		selectedPoint = point;
	}

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

		{#if lastSelectedRegion}
			<p>選択領域: {lastSelectedRegion.join(', ')}</p>
		{/if}
	</section>

	<section class="map-target">
		<h2>Map</h2>
		<div class="map-area">
			<EditorMap {selectedPoint} onselectpoint={handleMapSelectPoint} />
		</div>
		{#if selectedPoint}
			<p>選択中の座標: {selectedPoint[0].toFixed(1)}, {selectedPoint[1].toFixed(1)}</p>
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

	.map-target {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.map-area {
		height: 400px;
	}
</style>
