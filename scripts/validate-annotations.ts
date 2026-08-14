import { readFileSync } from 'node:fs';
import { validateAnnotationsFile } from '../src/lib/annotations/serialize';

const targetPath = process.argv[2] ?? 'static/data/annotations.json';

let raw: string;
try {
	raw = readFileSync(targetPath, 'utf-8');
} catch (error) {
	console.error(`ファイルを読み込めませんでした: ${targetPath}`);
	console.error(error);
	process.exit(1);
}

let json: unknown;
try {
	json = JSON.parse(raw);
} catch (error) {
	console.error(`JSONとして解析できませんでした: ${targetPath}`);
	console.error(error);
	process.exit(1);
}

const result = validateAnnotationsFile(json);

if (!result.valid) {
	console.error(`バリデーション失敗: ${targetPath}`);
	for (const message of result.errors) {
		console.error(`  - ${message}`);
	}
	process.exit(1);
}

console.log(`OK: ${targetPath}（annotation ${result.file.annotations.length}件）`);
