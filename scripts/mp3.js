import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import NodeID3 from 'node-id3';

const episode = process.argv[2];

if (!episode) {
	console.error('Укажи номер эпизода: npm run mp3 N');
	process.exit(1);
}

const ymlPath = path.join('src', 'episodes', episode, 'index.yml');
const mp3Path = path.join('src', 'episodes', episode, 'audio.mp3');
const coverPath = path.join('src', 'episodes', episode, 'cover.jpg');
const metaPath = path.join('src', 'data', 'meta.yml');

if (!fs.existsSync(ymlPath)) {
	console.error(`Файл не найден: ${ymlPath}`);
	process.exit(1);
}

if (!fs.existsSync(mp3Path)) {
	console.error(`Файл не найден: ${mp3Path}`);
	process.exit(1);
}

const data = yaml.load(fs.readFileSync(ymlPath, 'utf-8'));
const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));

const title = `${episode}. ${data.title}`;
const album = meta.title;
const artist = meta.title;
const hosts = '— Маша Аникеева\n— Вадим Макеев';

function timeToMs(time) {
	const parts = time.split(':').map(Number);
	if (parts.length === 3) {
		return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
	}
	return (parts[0] * 60 + parts[1]) * 1000;
}

function getDurationMs() {
	const result = execSync(
		`ffprobe -v quiet -print_format json -show_format "${mp3Path}"`,
		{ encoding: 'utf-8' }
	);
	const info = JSON.parse(result);
	return Math.floor(parseFloat(info.format.duration) * 1000);
}

const durationMs = getDurationMs();

const allChapters = [
	{ time: '00:00', title: 'Интро' },
	...data.chapters,
];

const chapters = allChapters.map((ch, i, arr) => {
	const startTimeMs = timeToMs(ch.time);
	const endTimeMs = arr[i + 1] ? timeToMs(arr[i + 1].time) : durationMs;
	return {
		elementID: `ch${i}`,
		startTimeMs,
		endTimeMs,
		tags: {
			title: ch.title,
		},
	};
});

const tags = {
	title,
	artist,
	album,
	comment: {
		language: 'eng',
		text: hosts,
	},
	unsynchronisedLyrics: {
		language: 'eng',
		text: hosts,
	},
	chapter: chapters,
	tableOfContents: [
		{
			elementID: 'toc',
			isOrdered: true,
			elements: chapters.map((ch) => ch.elementID),
		},
	],
};

if (fs.existsSync(coverPath)) {
	tags.image = {
		mime: 'image/jpeg',
		type: { id: 3, name: 'front cover' },
		description: '',
		imageBuffer: fs.readFileSync(coverPath),
	};
}

const success = NodeID3.write(tags, mp3Path);

if (success === true) {
	console.log(`✓ Теги обновлены:\n`);
	console.log(mp3Path);
} else {
	console.error('Ошибка при записи тегов:', success);
	process.exit(1);
}
