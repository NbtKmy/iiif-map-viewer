import { AnnotationSchema, type Annotation } from './schema';

export class AnnotationsLoadError extends Error {}

export type AnnotationsLoadResult = {
	georeference: string;
	annotations: Annotation[];
	skippedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export async function fetchAnnotations(url: string): Promise<AnnotationsLoadResult> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new AnnotationsLoadError(
			'annotations.jsonを取得できませんでした（ネットワークエラー）。'
		);
	}

	if (!response.ok) {
		throw new AnnotationsLoadError(
			`annotations.jsonを取得できませんでした（HTTP ${response.status}）。`
		);
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		throw new AnnotationsLoadError('annotations.jsonの内容をJSONとして解釈できませんでした。');
	}

	if (!isRecord(json) || !Array.isArray(json['annotations'])) {
		throw new AnnotationsLoadError('annotations.jsonの形式が不正です。');
	}

	const georeference = isRecord(json['map']) ? json['map']['georeference'] : undefined;
	if (typeof georeference !== 'string') {
		throw new AnnotationsLoadError('annotations.jsonの形式が不正です（mapが指定されていません）。');
	}

	const seenIds = new Set<string>();
	const annotations: Annotation[] = [];
	let skippedCount = 0;

	for (const raw of json['annotations']) {
		const result = AnnotationSchema.safeParse(raw);
		if (!result.success) {
			skippedCount++;
			console.warn('不正なannotationをスキップしました。', result.error.issues);
			continue;
		}
		if (seenIds.has(result.data.id)) {
			skippedCount++;
			console.warn(`idが重複しているannotationをスキップしました: ${result.data.id}`);
			continue;
		}
		seenIds.add(result.data.id);
		annotations.push(result.data);
	}

	return { georeference, annotations, skippedCount };
}
