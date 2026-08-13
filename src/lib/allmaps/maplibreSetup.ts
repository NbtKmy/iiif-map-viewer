import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let initialized = false;

export function ensureMaplibreWorker(): void {
	if (initialized) return;
	setWorkerUrl(maplibreWorkerUrl);
	initialized = true;
}
