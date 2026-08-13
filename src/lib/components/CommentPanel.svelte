<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
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

	let erroredIndexes = new SvelteSet<number>();

	$effect(() => {
		void annotation.id;
		erroredIndexes.clear();
	});

	function handleImageError(index: number) {
		erroredIndexes.add(index);
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
			<!-- eslint-disable svelte/no-navigation-without-resolve -- 外部IIIF資料への絶対URLのため対象外 -->
			<a
				class="source-link"
				href={resolveCanvasViewerUrl(source.canvas)}
				target="_blank"
				rel="noreferrer"
			>
				元資料を見る
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
