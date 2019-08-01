module.exports = function(config) {
    config.addPassthroughCopy('src/favicon.ico');
    config.addPassthroughCopy('src/fonts');
    config.addPassthroughCopy('src/images');
    config.addPassthroughCopy('src/scripts');
    config.addPassthroughCopy('src/styles');

    config.addFilter('rfc822Date', function(value) {
        let rfc822Date = require('rfc822-date');
        return rfc822Date(value);
    });

    return {
        dir: {
            input: 'src',
            output: 'dist'
        },
        dataTemplateEngine: 'njk',
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk',
        passthroughFileCopy: true,
        templateFormats: [
            'md',
            'jpg', 'mp3'
        ],
    };
};
