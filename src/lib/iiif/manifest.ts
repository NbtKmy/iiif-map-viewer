export type ParsedCanvas = {
	id: string;
	label: string;
	width: number;
	height: number;
	imageServiceId: string;
};

export type ParsedManifest = {
	id: string;
	label: string;
	canvases: ParsedCanvas[];
};

export class ManifestParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function extractLabel(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const extracted = extractLabel(entry);
			if (extracted !== undefined) return extracted;
		}
		return undefined;
	}
	if (isRecord(value) && typeof value['@value'] === 'string') {
		return value['@value'];
	}
	return undefined;
}

function extractImageServiceId(service: unknown): string | undefined {
	if (Array.isArray(service)) {
		for (const entry of service) {
			const id = extractImageServiceId(entry);
			if (id !== undefined) return id;
		}
		return undefined;
	}
	if (isRecord(service) && typeof service['@id'] === 'string') {
		return service['@id'];
	}
	return undefined;
}

function hasPresentation2Context(context: unknown): boolean {
	if (typeof context === 'string') {
		return context.includes('presentation/2/context.json');
	}
	if (Array.isArray(context)) {
		return context.some(
			(entry) => typeof entry === 'string' && entry.includes('presentation/2/context.json')
		);
	}
	return false;
}

function parseCanvas(canvas: unknown): ParsedCanvas | null {
	if (!isRecord(canvas)) return null;

	const id = canvas['@id'];
	const width = canvas['width'];
	const height = canvas['height'];
	if (typeof id !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
		return null;
	}

	const images = canvas['images'];
	if (!Array.isArray(images) || images.length === 0) return null;

	const firstImage = images[0];
	if (!isRecord(firstImage)) return null;

	const resource = firstImage['resource'];
	if (!isRecord(resource)) return null;

	const rawImageServiceId = extractImageServiceId(resource['service']);
	if (rawImageServiceId === undefined) return null;
	const imageServiceId = rawImageServiceId.replace(/\/$/, '');

	const label = extractLabel(canvas['label']) ?? id;

	return { id, label, width, height, imageServiceId };
}

export function parseManifest(json: unknown): ParsedManifest {
	if (!isRecord(json)) {
		throw new ManifestParseError('Manifestの形式が不正です。');
	}

	if (!hasPresentation2Context(json['@context'])) {
		throw new ManifestParseError('このManifestはIIIF Presentation API 2.0形式ではありません。');
	}

	const sequences = json['sequences'];
	if (!Array.isArray(sequences) || sequences.length === 0) {
		throw new ManifestParseError('Manifestにsequencesが含まれていません。');
	}

	const firstSequence = sequences[0];
	const rawCanvases = isRecord(firstSequence) ? firstSequence['canvases'] : undefined;
	if (!Array.isArray(rawCanvases)) {
		throw new ManifestParseError('Manifestにcanvasesが含まれていません。');
	}

	const canvases = rawCanvases
		.map(parseCanvas)
		.filter((canvas): canvas is ParsedCanvas => canvas !== null);

	const seenIds = new Set<string>();
	const dedupedCanvases = canvases.filter((canvas) => {
		if (seenIds.has(canvas.id)) return false;
		seenIds.add(canvas.id);
		return true;
	});

	if (dedupedCanvases.length === 0) {
		throw new ManifestParseError('Manifestに有効なCanvasが含まれていません。');
	}

	return {
		id: typeof json['@id'] === 'string' ? json['@id'] : '',
		label: extractLabel(json['label']) ?? '',
		canvases: dedupedCanvases
	};
}

export async function fetchManifest(url: string): Promise<ParsedManifest> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new ManifestParseError(
			'Manifestを取得できませんでした（ネットワークまたはCORSエラー）。'
		);
	}

	if (!response.ok) {
		throw new ManifestParseError(`Manifestを取得できませんでした（HTTP ${response.status}）。`);
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		throw new ManifestParseError('Manifestの内容をJSONとして解釈できませんでした。');
	}

	return parseManifest(json);
}
