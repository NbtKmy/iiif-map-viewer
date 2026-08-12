<script lang="ts">
	import type { Annotation } from '$lib/annotations/schema';
	import { buildCommentImageUrl } from '$lib/iiif/imageApi';

	let {
		annotation,
		onclose
	}: {
		annotation: Annotation;
		onclose: () => void;
	} = $props();

	let imageErrorAnnotationId = $state<string | undefined>(undefined);
	const imageError = $derived(imageErrorAnnotationId === annotation.id);

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

	{#if imageError}
		<p class="image-error">画像を取得できませんでした。</p>
	{:else}
		<img
			class="comment-image"
			src={buildCommentImageUrl(
				annotation.commentSource.imageService,
				annotation.commentSource.xywh
			)}
			alt={annotation.label}
			onerror={() => (imageErrorAnnotationId = annotation.id)}
		/>
	{/if}

	{#if annotation.description}
		<p class="description">{annotation.description}</p>
	{/if}

	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部IIIF資料への絶対URLのため対象外 -->
	<a class="source-link" href={annotation.commentSource.canvas} target="_blank" rel="noreferrer">
		元資料を見る
	</a>
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

	.comment-image {
		display: block;
		width: 100%;
		height: auto;
		margin-bottom: 1rem;
	}

	.image-error {
		color: #900;
	}

	.description {
		white-space: pre-wrap;
	}

	.source-link {
		display: inline-block;
		margin-top: 1rem;
	}

	@media (max-width: 640px) {
		.comment-panel {
			top: auto;
			width: 100%;
			max-height: 60vh;
		}
	}
</style>
