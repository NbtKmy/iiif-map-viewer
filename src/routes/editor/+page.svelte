<script lang="ts">
	import { fetchManifest, ManifestParseError, type ParsedCanvas } from '$lib/iiif/manifest';
	import { buildDisplayImageUrl } from '$lib/iiif/imageApi';
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
			<div class="image-area">
				<img
					src={buildDisplayImageUrl(
						selectedCanvas.imageServiceId,
						selectedCanvas.width,
						selectedCanvas.height
					)}
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
