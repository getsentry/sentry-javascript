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

  getAddonConfig(app) {
    let config = {};
    try {
      config = require(app.project.configPath())(app.env);
    } catch(_) {
      // Config not found
    }
    return config['@sentry/ember'] || {};
  },

  included() {
    this._super.included.apply(this, arguments);
    const app = this._findHost(this);
    if (!('@embroider/core' in app.dependencies())) {
      const addonConfig = this.getAddonConfig(app);
      const options = Object.assign({}, addonConfig);
      this.options['@embroider/macros'].setOwnConfig.sentryConfig = options;
    }
  },

  contentFor(type, config) {
    const addonConfig = config['@sentry/ember'] || {};
    const app = this._findHost(this);
    this.app = app;
    const options = Object.assign({}, addonConfig);
    this.options['@embroider/macros'].setOwnConfig.sentryConfig = options;

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
