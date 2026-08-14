<script lang="ts">
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

	let containerEl: HTMLDivElement;
	let dragStart = $state<{ x: number; y: number } | undefined>(undefined);
	let dragCurrent = $state<{ x: number; y: number } | undefined>(undefined);

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

<div
	class="region-selector"
	bind:this={containerEl}
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

<style>
	.region-selector {
		position: relative;
		display: inline-block;
		cursor: crosshair;
		touch-action: none;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 60vh;
		user-select: none;
	}

	.drag-box {
		position: absolute;
		border: 2px solid #e11d48;
		background: rgba(225, 29, 72, 0.15);
		pointer-events: none;
	}
</style>
