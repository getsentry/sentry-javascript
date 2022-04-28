'use strict';
const fs = require('fs');
const crypto = require('crypto');

function readSnippet(fileName) {
  return fs.readFileSync(`${__dirname}/vendor/${fileName}`, 'utf8');
}

function hashSha256base64(string) {
  return crypto.createHash('sha256').update(string).digest('base64');
}

const initialLoadHeadSnippet = readSnippet('initial-load-head.js');
const initialLoadBodySnippet = readSnippet('initial-load-body.js');

const initialLoadHeadSnippetHash = hashSha256base64(initialLoadHeadSnippet);
const initialLoadBodySnippetHash = hashSha256base64(initialLoadBodySnippet);

module.exports = {
  name: require('./package').name,
  options: {
    babel: {
      plugins: [require.resolve('ember-auto-import/babel-plugin')],
    },
    '@embroider/macros': {
      setOwnConfig: {},
    },
  },

  config(_, appConfig) {
    const addonConfig = appConfig['@sentry/ember'];
    this.options['@embroider/macros'].setOwnConfig.sentryConfig = { ...addonConfig };
    return this._super(...arguments);
  },

  contentFor(type, config) {
    const addonConfig = config['@sentry/ember'] || {};
    const { disablePerformance, disableInitialLoadInstrumentation } = addonConfig;

    if (disablePerformance || disableInitialLoadInstrumentation) {
      return;
    }

    if (type === 'head') {
      return [
        `<meta http-equiv="Content-Security-Policy" content="script-src 'sha256-${initialLoadHeadSnippetHash}'">`,
        `<meta http-equiv="Content-Security-Policy" content="script-src 'sha256-${initialLoadBodySnippetHash}'">`,
        `<script type="text/javascript">${initialLoadHeadSnippet}</script>`,
      ].join('\n');
    } else if (type === 'body-footer') {
      return `<script type="text/javascript">${initialLoadBodySnippet}</script>`;
    }
  },
};
