<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Map as MaplibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { WarpedMapLayer } from '@allmaps/maplibre';
	import { parseAnnotation } from '@allmaps/annotation';
	import { GcpTransformer } from '@allmaps/transform';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { fetchAnnotations } from '$lib/annotations/load';
	import type { Annotation } from '$lib/annotations/schema';
	import CommentPanel from '$lib/components/CommentPanel.svelte';

	setWorkerUrl(maplibreWorkerUrl);

	let mapContainer: HTMLDivElement;
	let map: MaplibreMap | undefined;
	let warpedMapLayer: WarpedMapLayer | undefined;
	let opacity = $state(0.7);
	let loadError = $state<string | undefined>(undefined);
	let annotationsError = $state<string | undefined>(undefined);
	let annotations = $state<Annotation[]>([]);
	let selectedAnnotationId = $state<string | undefined>(undefined);
	let markers: Marker[] = [];

	const selectedAnnotation = $derived(
		annotations.find((annotation) => annotation.id === selectedAnnotationId)
	);

	function placeMarkers(transformer: GcpTransformer) {
		annotations.forEach((annotation, index) => {
			if (annotation.mapTarget.type !== 'point') return;

			const [lon, lat] = transformer.transformToGeo(annotation.mapTarget.xy);

			const element = document.createElement('button');
			element.type = 'button';
			element.className = 'annotation-marker';
			element.textContent = String(index + 1);
			element.setAttribute('aria-label', annotation.label);
			element.addEventListener('click', () => {
				selectedAnnotationId = annotation.id;
			});

			const marker = new Marker({ element }).setLngLat([lon, lat]).addTo(map!);
			markers.push(marker);
		});
	}

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

			let transformer: GcpTransformer | undefined;

			try {
				const response = await fetch(`${base}/data/map-georeference.json`);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const georeferenceAnnotation = await response.json();
				const results = warpedMapLayer!.addGeoreferenceAnnotation(georeferenceAnnotation);
				const firstError = results.find((result) => result instanceof Error);
				if (firstError) {
					throw firstError;
				}

				const bounds = warpedMapLayer!.getBounds();
				if (bounds) {
					map!.fitBounds(bounds, { padding: 40 });
				}

				const georeferencedMaps = parseAnnotation(georeferenceAnnotation);
				if (georeferencedMaps.length > 0) {
					transformer = GcpTransformer.fromGeoreferencedMap(georeferencedMaps[0]);
				}
			} catch (error) {
				loadError = 'ジオリファレンス地図を読み込めませんでした。';
				console.error(error);
			}

			try {
				const result = await fetchAnnotations(`${base}/data/annotations.json`);
				annotations = result.annotations;
				if (transformer) {
					placeMarkers(transformer);
				}
			} catch (error) {
				annotationsError = 'コメントデータを読み込めませんでした。';
				console.error(error);
			}
		});
	});

	onDestroy(() => {
		markers.forEach((marker) => marker.remove());
		map?.remove();
	});

	function handleOpacityChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		opacity = value;
		warpedMapLayer?.setLayerOptions({ opacity: value });
	}

	function closePanel() {
		selectedAnnotationId = undefined;
	}
</script>

<div class="viewer">
	<div class="map" bind:this={mapContainer}></div>

	{#if loadError}
		<p class="error" role="alert">{loadError}</p>
	{/if}

	{#if annotationsError}
		<p class="error" role="alert">{annotationsError}</p>
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

	{#if selectedAnnotation}
		<CommentPanel annotation={selectedAnnotation} onclose={closePanel} />
	{/if}
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

	:global(.annotation-marker) {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		border: 2px solid white;
		background: #1a73e8;
		color: white;
		font-weight: bold;
		font-size: 0.85rem;
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	:global(.annotation-marker:focus-visible) {
		outline: 3px solid #ffb300;
		outline-offset: 2px;
	}
</style>
