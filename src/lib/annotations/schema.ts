import { z } from 'zod';

const MAP_IMAGE_WIDTH = 7302;
const MAP_IMAGE_HEIGHT = 4891;

const PointTargetSchema = z.object({
	type: z.literal('point'),
	xy: z.tuple([
		z.number().nonnegative().max(MAP_IMAGE_WIDTH),
		z.number().nonnegative().max(MAP_IMAGE_HEIGHT)
	])
});

const RectTargetSchema = z.object({
	type: z.literal('rect'),
	xywh: z.tuple([
		z.number().nonnegative().max(MAP_IMAGE_WIDTH),
		z.number().nonnegative().max(MAP_IMAGE_HEIGHT),
		z.number().positive(),
		z.number().positive()
	])
});

const MapTargetSchema = z
	.discriminatedUnion('type', [PointTargetSchema, RectTargetSchema])
	.superRefine((target, ctx) => {
		if (target.type !== 'rect') return;
		const [x, y, w, h] = target.xywh;
		if (x + w > MAP_IMAGE_WIDTH) {
			ctx.addIssue({
				code: 'custom',
				message: `Rectangleの範囲が地図画像の幅(${MAP_IMAGE_WIDTH})を超えています。`,
				path: ['xywh']
			});
		}
		if (y + h > MAP_IMAGE_HEIGHT) {
			ctx.addIssue({
				code: 'custom',
				message: `Rectangleの範囲が地図画像の高さ(${MAP_IMAGE_HEIGHT})を超えています。`,
				path: ['xywh']
			});
		}
	});

const CommentSourceSchema = z.object({
	manifest: z.string().min(1),
	canvas: z.string().min(1),
	imageService: z.string().min(1),
	xywh: z.tuple([
		z.number().nonnegative(),
		z.number().nonnegative(),
		z.number().positive(),
		z.number().positive()
	])
});

export const AnnotationSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	description: z.string().default(''),
	mapTarget: MapTargetSchema,
	commentSources: z.array(CommentSourceSchema).min(1)
});

export const AnnotationsFileSchema = z
	.object({
		version: z.literal(1),
		map: z.object({
			georeference: z.string().min(1)
		}),
		annotations: z.array(AnnotationSchema)
	})
	.superRefine((file, ctx) => {
		const seenIds = new Set<string>();
		file.annotations.forEach((annotation, index) => {
			if (seenIds.has(annotation.id)) {
				ctx.addIssue({
					code: 'custom',
					message: `idが重複しています: ${annotation.id}`,
					path: ['annotations', index, 'id']
				});
			}
			seenIds.add(annotation.id);
		});
	});

export type MapTarget = z.infer<typeof MapTargetSchema>;
export type CommentSource = z.infer<typeof CommentSourceSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationsFile = z.infer<typeof AnnotationsFileSchema>;
