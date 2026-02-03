import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(brotliCompress);

const DIST_DIR = 'dist';
const EXTENSIONS = ['.css', '.js', '.html', '.xml', '.svg'];

async function* getFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			yield* getFiles(path);
		} else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
			yield path;
		}
	}
}

async function compressFile(path) {
	const content = await readFile(path);
	const compressed = await compress(content, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
		},
	});

	await writeFile(`${path}.br`, compressed);

	return {
		original: content.length,
		compressed: compressed.length,
	};
}

const results = [];

for await (const file of getFiles(DIST_DIR)) {
	results.push(compressFile(file));
}

const stats = await Promise.all(results);
const totalOriginal = stats.reduce((sum, s) => sum + s.original, 0);
const totalCompressed = stats.reduce((sum, s) => sum + s.compressed, 0);
const savings = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);

const formatBytes = (bytes) => {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	return `${mb.toFixed(2)} MB`;
};

console.log(`Compressed ${stats.length} files: ${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)} (-${savings}%)`);