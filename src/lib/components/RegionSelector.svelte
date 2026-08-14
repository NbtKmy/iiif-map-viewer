<script lang="ts">
	import { onMount } from 'svelte';

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
	const MAX_HEIGHT_VH = 60;
	const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
	const DEFAULT_ZOOM_INDEX = ZOOM_LEVELS.indexOf(1);

	let containerEl: HTMLDivElement;
	let wrapperEl: HTMLDivElement;
	let fitScale = $state(1);
	let zoomIndex = $state(DEFAULT_ZOOM_INDEX);
	let mode = $state<'select' | 'pan'>('select');
	let dragStart = $state<{ x: number; y: number } | undefined>(undefined);
	let dragCurrent = $state<{ x: number; y: number } | undefined>(undefined);
	let panStart = $state<
		{ x: number; y: number; scrollLeft: number; scrollTop: number } | undefined
	>(undefined);

	const zoom = $derived(ZOOM_LEVELS[zoomIndex]);
	const displayWidth = $derived(Math.round(canvasWidth * fitScale * zoom));
	const displayHeight = $derived(Math.round(canvasHeight * fitScale * zoom));

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

	function recalcFitScale(width: number, height: number) {
		if (!wrapperEl) return;
		const availableWidth = wrapperEl.clientWidth;
		const maxHeightPx = (window.innerHeight * MAX_HEIGHT_VH) / 100;
		const widthScale = availableWidth / width;
		const heightScale = maxHeightPx / height;
		fitScale = Math.min(widthScale, heightScale, 1);
	}

	$effect(() => {
		recalcFitScale(canvasWidth, canvasHeight);
	});

	onMount(() => {
		const handleResize = () => recalcFitScale(canvasWidth, canvasHeight);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function zoomIn() {
		zoomIndex = Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1);
	}

	function zoomOut() {
		zoomIndex = Math.max(zoomIndex - 1, 0);
	}

	function toContainerPoint(event: PointerEvent): { x: number; y: number } {
		const rect = containerEl.getBoundingClientRect();
		return {
			x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
			y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
		};
	}

	function handlePointerDown(event: PointerEvent) {
		containerEl.setPointerCapture(event.pointerId);

		if (mode === 'pan') {
			panStart = {
				x: event.clientX,
				y: event.clientY,
				scrollLeft: wrapperEl.scrollLeft,
				scrollTop: wrapperEl.scrollTop
			};
			return;
		}

		dragStart = toContainerPoint(event);
		dragCurrent = dragStart;
	}

	function handlePointerMove(event: PointerEvent) {
		if (mode === 'pan') {
			if (!panStart) return;
			wrapperEl.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
			wrapperEl.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
			return;
		}

		if (!dragStart) return;
		dragCurrent = toContainerPoint(event);
	}

	function handlePointerUp() {
		if (mode === 'pan') {
			panStart = undefined;
			return;
		}

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

<div class="region-selector-panel">
	<div class="toolbar">
		<div class="zoom-controls">
			<button type="button" onclick={zoomOut} disabled={zoomIndex === 0} aria-label="縮小">
				−
			</button>
			<span>{Math.round(zoom * 100)}%</span>
			<button
				type="button"
				onclick={zoomIn}
				disabled={zoomIndex === ZOOM_LEVELS.length - 1}
				aria-label="拡大"
			>
				+
			</button>
		</div>
		<div class="mode-controls" role="group" aria-label="操作モード">
			<button
				type="button"
				class:active={mode === 'select'}
				aria-pressed={mode === 'select'}
				onclick={() => (mode = 'select')}
			>
				選択
			</button>
			<button
				type="button"
				class:active={mode === 'pan'}
				aria-pressed={mode === 'pan'}
				onclick={() => (mode = 'pan')}
			>
				移動
			</button>
		</div>
	</div>
	<div class="region-selector-wrapper" bind:this={wrapperEl}>
		<div
			class="region-selector"
			class:panning={mode === 'pan'}
			bind:this={containerEl}
			style={`width:${displayWidth}px; height:${displayHeight}px;`}
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
	</div>
</div>

<style>
	.region-selector-panel {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.zoom-controls,
	.mode-controls {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.zoom-controls button,
	.mode-controls button {
		height: 2rem;
		border: 1px solid var(--color-border, #d7deda);
		border-radius: 4px;
		background: var(--color-surface, #fff);
		color: var(--color-ink, #1f2b26);
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.zoom-controls button {
		width: 2rem;
	}

	.mode-controls button {
		width: auto;
		padding: 0 0.75rem;
	}

	.zoom-controls button:hover:not(:disabled),
	.mode-controls button:hover {
		border-color: var(--color-accent, #2b6e63);
	}

	.zoom-controls button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.mode-controls button.active {
		background: var(--color-accent, #2b6e63);
		border-color: var(--color-accent, #2b6e63);
		color: #fff;
	}

	.region-selector-wrapper {
		max-width: 100%;
		max-height: 60vh;
		overflow: auto;
		border: 1px solid var(--color-border, #d7deda);
		border-radius: 6px;
		background: var(--color-bg, #eef2f0);
	}

	.region-selector {
		position: relative;
		cursor: crosshair;
		touch-action: none;
	}

	.region-selector.panning {
		cursor: grab;
	}

	.region-selector.panning:active {
		cursor: grabbing;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
	}

	.drag-box {
		position: absolute;
		border: 2px solid var(--color-accent, #2b6e63);
		background: rgba(43, 110, 99, 0.15);
		pointer-events: none;
	}
</style>
