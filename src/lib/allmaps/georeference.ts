import type { Map as MaplibreMap } from 'maplibre-gl';
import type { WarpedMapLayer } from '@allmaps/maplibre';
import { parseAnnotation } from '@allmaps/annotation';
import { GcpTransformer } from '@allmaps/transform';

export class GeoreferenceLoadError extends Error {}

export type GeoreferenceLoadResult = {
	transformer: GcpTransformer | undefined;
};

export async function loadGeoreferencedMap(
	url: string,
	map: MaplibreMap,
	warpedMapLayer: WarpedMapLayer
): Promise<GeoreferenceLoadResult> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	if (!response.ok) {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	let georeferenceAnnotation: unknown;
	try {
		georeferenceAnnotation = await response.json();
	} catch {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	const results = warpedMapLayer.addGeoreferenceAnnotation(georeferenceAnnotation);
	const firstError = results.find((result) => result instanceof Error);
	if (firstError) {
		throw new GeoreferenceLoadError('ジオリファレンス地図を読み込めませんでした。');
	}

	const bounds = warpedMapLayer.getBounds();
	if (bounds) {
		map.fitBounds(bounds, { padding: 40 });
	}

	const georeferencedMaps = parseAnnotation(georeferenceAnnotation);
	const transformer =
		georeferencedMaps.length > 0
			? GcpTransformer.fromGeoreferencedMap(georeferencedMaps[0])
			: undefined;

	return { transformer };
}
