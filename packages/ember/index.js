'use strict';
const fs = require('fs');

function readSnippet(fileName) {
  return `<script>${fs.readFileSync(`${__dirname}/vendor/${fileName}`, 'utf8')}</script>`;
}

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
      return readSnippet('initial-load-head.js');
    }
    if (type === 'body-footer') {
      return readSnippet('initial-load-body.js');
    }
  },
};
