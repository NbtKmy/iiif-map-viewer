export function buildImageUrl(
	imageServiceId: string,
	options: { region?: string; size?: string } = {}
): string {
	const region = options.region ?? 'full';
	const size = options.size ?? 'full';
	return `${imageServiceId}/${region}/${size}/0/default.jpg`;
}

export function buildThumbnailUrl(imageServiceId: string, maxHeight = 150): string {
	return buildImageUrl(imageServiceId, { size: `,${maxHeight}` });
}

export function buildFullImageUrl(imageServiceId: string): string {
	return buildImageUrl(imageServiceId);
}

export function buildCommentImageUrl(
	imageServiceId: string,
	xywh: readonly [number, number, number, number],
	maxWidth = 800
): string {
	const [x, y, w, h] = xywh;
	return buildImageUrl(imageServiceId, { region: `${x},${y},${w},${h}`, size: `${maxWidth},` });
}

const EDITOR_DISPLAY_MAX_DIMENSION = 1600;

export function buildDisplayImageUrl(
	imageServiceId: string,
	canvasWidth: number,
	canvasHeight: number,
	maxDimension = EDITOR_DISPLAY_MAX_DIMENSION
): string {
	if (canvasWidth <= maxDimension && canvasHeight <= maxDimension) {
		return buildFullImageUrl(imageServiceId);
	}
	return buildImageUrl(imageServiceId, { size: `!${maxDimension},${maxDimension}` });
}
