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

	button.selected .label {
		font-weight: bold;
		text-decoration: underline;
	}
</style>
