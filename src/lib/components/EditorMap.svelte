<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Map as MaplibreMap, Marker } from 'maplibre-gl';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import type { GcpTransformer } from '@allmaps/transform';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { ensureMaplibreWorker } from '$lib/allmaps/maplibreSetup';
	import { loadGeoreferencedMap } from '$lib/allmaps/georeference';

	ensureMaplibreWorker();

	let {
		selectedPoint,
		onselectpoint
	}: {
		selectedPoint: [number, number] | undefined;
		onselectpoint: (resourcePoint: [number, number]) => void;
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: MaplibreMap | undefined;
	let transformer: GcpTransformer | undefined;
	let marker: Marker | undefined;
	let loadError = $state<string | undefined>(undefined);

	onMount(() => {
		map = new MaplibreMap({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
			center: [129.8686, 32.7443],
			zoom: 14,
			maxPitch: 0
		});

		const warpedMapLayer = new WarpedMapLayer();

		map.on('load', async () => {
			// @ts-expect-error WarpedMapLayer implements CustomLayerInterface but MapLibre's layer types are incompatible
			map!.addLayer(warpedMapLayer);

			try {
				const result = await loadGeoreferencedMap(
					`${base}/data/map-georeference.json`,
					map!,
					warpedMapLayer
				);
				transformer = result.transformer;
			} catch (error) {
				loadError = 'ジオリファレンス地図を読み込めませんでした。';
				console.error(error);
			}
		});

		map.on('click', (event) => {
			if (!transformer) return;
			const resourcePoint = transformer.transformToResource([event.lngLat.lng, event.lngLat.lat]);
			onselectpoint(resourcePoint);
		});
	});

	onDestroy(() => {
		marker?.remove();
		map?.remove();
	});

	$effect(() => {
		marker?.remove();
		marker = undefined;
		if (!selectedPoint || !transformer || !map) return;
		const [lon, lat] = transformer.transformToGeo(selectedPoint);
		marker = new Marker({ color: '#e11d48' }).setLngLat([lon, lat]).addTo(map);
	});
</script>

<div class="editor-map" bind:this={mapContainer}></div>

{#if loadError}
	<p class="error" role="alert">{loadError}</p>
{/if}

<style>
	.editor-map {
		width: 100%;
		height: 100%;
		min-height: 320px;
	}

	.error {
		color: #900;
		background: #fee;
		padding: 0.5rem 1rem;
		border-radius: 4px;
	}
</style>
