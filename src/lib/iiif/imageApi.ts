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
