<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Map as MaplibreMap, setWorkerUrl } from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import 'maplibre-gl/dist/maplibre-gl.css';

	setWorkerUrl(maplibreWorkerUrl);

	let mapContainer: HTMLDivElement;
	let map: MaplibreMap | undefined;
	let warpedMapLayer: WarpedMapLayer | undefined;
	let opacity = $state(0.7);
	let loadError = $state<string | undefined>(undefined);

	onMount(() => {
		map = new MaplibreMap({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
			center: [129.8686, 32.7443],
			zoom: 14,
			maxPitch: 0
		});

		warpedMapLayer = new WarpedMapLayer();

		map.on('load', async () => {
			// @ts-expect-error WarpedMapLayer implements CustomLayerInterface but MapLibre's layer types are incompatible
			map!.addLayer(warpedMapLayer);

			try {
				const response = await fetch(`${base}/data/map-georeference.json`);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const annotation = await response.json();
				const results = warpedMapLayer!.addGeoreferenceAnnotation(annotation);
				const firstError = results.find((result) => result instanceof Error);
				if (firstError) {
					throw firstError;
				}

				const bounds = warpedMapLayer!.getBounds();
				if (bounds) {
					map!.fitBounds(bounds, { padding: 40 });
				}
			} catch (error) {
				loadError = 'ジオリファレンス地図を読み込めませんでした。';
				console.error(error);
			}
		});
	});

	onDestroy(() => {
		map?.remove();
	});

	function handleOpacityChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		opacity = value;
		warpedMapLayer?.setLayerOptions({ opacity: value });
	}
</script>

<div class="viewer">
	<div class="map" bind:this={mapContainer}></div>

	{#if loadError}
		<p class="error" role="alert">{loadError}</p>
	{/if}

	<div class="opacity-control">
		<label for="opacity">古地図の透明度</label>
		<input
			id="opacity"
			type="range"
			min="0"
			max="1"
			step="0.01"
			value={opacity}
			oninput={handleOpacityChange}
		/>
	</div>
</div>

<style>
	.viewer {
		position: relative;
		width: 100%;
		height: 100vh;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	.opacity-control {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: white;
		border-radius: 4px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}

	.error {
		position: absolute;
		top: 1rem;
		left: 1rem;
		padding: 0.5rem 1rem;
		background: #fee;
		color: #900;
		border-radius: 4px;
	}
</style>
