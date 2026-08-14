import { AnnotationsFileSchema, type Annotation, type AnnotationsFile } from './schema';

export function buildAnnotationsFile(annotations: Annotation[]): AnnotationsFile {
	return {
		version: 1,
		map: { georeference: '/data/map-georeference.json' },
		annotations
	};
}

export type ValidateResult =
	| { valid: true; file: AnnotationsFile }
	| { valid: false; errors: string[] };

export function validateAnnotationsFile(candidate: unknown): ValidateResult {
	const result = AnnotationsFileSchema.safeParse(candidate);
	if (result.success) {
		return { valid: true, file: result.data };
	}
	const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
	return { valid: false, errors };
}

export function downloadAnnotationsFile(file: AnnotationsFile, filename = 'annotations.json'): void {
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
