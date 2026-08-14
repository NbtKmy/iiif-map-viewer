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
	let dragStart = $state<{ x: number; y: number } | undefined>(undefined);
	let dragCurrent = $state<{ x: number; y: number } | undefined>(undefined);

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

<div class="region-selector-panel">
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
	<div class="region-selector-wrapper" bind:this={wrapperEl}>
		<div
			class="region-selector"
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

	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.zoom-controls button {
		width: 2rem;
		height: 2rem;
	}

	.region-selector-wrapper {
		max-width: 100%;
		max-height: 60vh;
		overflow: auto;
	}

	.region-selector {
		position: relative;
		cursor: crosshair;
		touch-action: none;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
	}

	.drag-box {
		position: absolute;
		border: 2px solid #e11d48;
		background: rgba(225, 29, 72, 0.15);
		pointer-events: none;
	}
</style>
