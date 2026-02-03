import { mkdir, readdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SRC_DIR = 'src/episodes';
const DIST_DIR = 'dist/episodes';

const episodes = await readdir(SRC_DIR, { withFileTypes: true });

for (const episode of episodes) {
	if (!episode.isDirectory()) continue;

	const srcPath = join(SRC_DIR, episode.name);
	const distPath = join(DIST_DIR, episode.name);

	await mkdir(distPath, { recursive: true });

	const files = await readdir(srcPath);

	for (const file of files) {
		if (!file.endsWith('.mp3')) continue;

		const srcFile = resolve(srcPath, file);
		const distFile = join(distPath, file);

		await symlink(srcFile, distFile).catch((err) => {
			if (err.code !== 'EEXIST') throw err;
		});
	}
}