const fs = require('fs');
const htmlmin = require('html-minifier');
const markdown = require('markdown-it')({ html: true });
const music = require('music-metadata');
const prettydata = require('pretty-data');

module.exports = (config) => {
    config.addPassthroughCopy('src/favicon.ico');
    config.addPassthroughCopy('src/fonts');
    config.addPassthroughCopy('src/images');
    config.addPassthroughCopy('src/scripts');
    config.addPassthroughCopy('src/styles');
    config.addPassthroughCopy('src/episodes/**/*.(jpg|mp3)');

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

    config.addFilter('htmlmin', (value) => {
        return htmlmin.minify(
            value, {
                removeComments: true,
                collapseWhitespace: true
            }
        );
    });

    config.addTransform('htmlmin', (content, outputPath) => {
        if(outputPath && outputPath.endsWith('.html')) {
            const result = htmlmin.minify(
                content, {
                    removeComments: true,
                    collapseWhitespace: true
                }
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

    return {
        dir: {
            input: 'src',
            output: 'dist',
            includes: 'includes',
            layouts: 'layouts'
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
