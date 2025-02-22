import fs from 'node:fs';
import esbuild from 'esbuild';
import htmlmin from 'html-minifier-terser';
import MarkdownIt from 'markdown-it';
import * as music from 'music-metadata';
import prettydata from 'pretty-data';
import yaml from 'js-yaml';
import * as lightningcss from 'lightningcss';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const markdown = new MarkdownIt({ html: true });

export default (config) => {
	// CSS

	const styles = [
		'./src/styles/index.css',
	];

	const processStyles = async (path) => {
		return await lightningcss.bundle({
			filename: path,
			minify: true,
			sourceMap: false,
			targets: lightningcss.browserslistToTargets(
				packageJson.browserslist,
			),
			include:
				lightningcss.Features.MediaQueries |
				lightningcss.Features.Nesting,
		});
	};

	config.addTemplateFormats('css');

	config.addExtension('css', {
		outputFileExtension: 'css',
		compile: async (content, path) => {
			if (!styles.includes(path)) {
				return;
			}

			return async () => {
				let { code } = await processStyles(path);

				return code;
			};
		},
	});

	config.addFilter('css', async (path) => {
		let { code } = await processStyles(path);

		return code;
	});

	// JavaScript

	config.addTemplateFormats('js');

	config.addExtension('js', {
		outputFileExtension: 'js',
		compile: async (content, path) => {
			if (path !== './src/scripts/index.js') {
				return;
			}

			return async () => {
				let output = await esbuild.build({
					target: 'es2020',
					entryPoints: [path],
					minify: true,
					bundle: true,
					write: false,
				});

				return output.outputFiles[0].text;
			}
		}
	});

	// OLD

	config.addDataExtension('yml', (contents) => {
		return yaml.load(contents);
	});

	config.addPairedShortcode('markdown', (content) => {
		return markdown.render(content);
	});

	config.addFilter('length', (path) => {
		const stats = fs.statSync(path);

		return stats.size;
	});

	const getDuration = (path) => {
		return music.parseFile(path)
			.then(metadata => {
				const duration = parseFloat(metadata.format.duration);
				return new Date(Math.ceil(duration) * 1000).toISOString().substring(11, 19);
			})
			.catch(error => {
				console.log(error);
			});
	}

	config.addNunjucksAsyncFilter('duration', async (path, callback) => {
		const duration = await getDuration(path);

		callback(null, duration);
	});

	const htmlminSettings = {
		collapseBooleanAttributes: true,
		collapseWhitespace: true,
		decodeEntities: true,
		includeAutoGeneratedTags: false,
		removeComments: true,
		sortClassName: true,
	}

	config.addFilter('htmlmin', async (value) => {
		return await htmlmin.minify(
			value,
			htmlminSettings,
		);
	});

	config.addTransform('htmlmin', (content, outputPath) => {
		if(outputPath && outputPath.endsWith('.html')) {
			const result = htmlmin.minify(
				content,
				htmlminSettings,
			);

			return result;
		}

		return content;
	});

	config.addTransform('xmlmin', (content, outputPath) => {
		if(outputPath && outputPath.endsWith('.xml')) {
			return prettydata.pd.xmlmin(content);
		}

		return content;
	});

	// Passthrough copy

	[
		'src/favicon.ico',
		'src/fonts',
		'src/images',
		'src/episodes/**/*.(jpg|mp3)',
	].forEach(
		path => config.addPassthroughCopy(path)
	);

	return {
		dir: {
			input: 'src',
			output: 'dist',
			includes: 'includes',
			layouts: 'layouts',
			data: 'data',
		},
		dataTemplateEngine: 'njk',
		markdownTemplateEngine: 'njk',
		htmlTemplateEngine: 'njk',
		passthroughFileCopy: true,
		templateFormats: [
			'md', 'njk'
		],
	};
};
