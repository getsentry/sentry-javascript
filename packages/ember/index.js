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

  included() {
    const app = this._findHost();
    const config = app.project.config(app.env);
    const addonConfig = dropUndefinedKeys(config['@sentry/ember'] || {});

    if (!isSerializable(addonConfig)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Warning: You passed a non-serializable config to \`ENV['@sentry/ember'].sentry\`.
Non-serializable config (e.g. RegExp, ...) can only be passed directly to \`Sentry.init()\`, which is usually defined in app/app.js.
The reason for this is that @embroider/macros, which is used under the hood to handle environment config, requires serializable configuration.`,
      );
    }

    this.options['@embroider/macros'].setOwnConfig.sentryConfig = addonConfig;

    this._super.included.apply(this, arguments);
  },

  contentFor(type, config) {
    const addonConfig = config['@sentry/ember'] || {};
    const { disablePerformance, disableInitialLoadInstrumentation } = addonConfig;

    if (disablePerformance || disableInitialLoadInstrumentation) {
      return;
    }

    if (type === 'head') {
      return `<script type="text/javascript">${initialLoadHeadSnippet}</script>`;
    } else if (type === 'body-footer') {
      return `<script type="text/javascript">${initialLoadBodySnippet}</script>`;
    }
  },

  injectedScriptHashes: [initialLoadHeadSnippetHash, initialLoadBodySnippetHash],
};

function isSerializable(obj) {
  if (isScalar(obj)) {
    return true;
  }

  if (Array.isArray(obj)) {
    return !obj.some(arrayItem => !isSerializable(arrayItem));
  }

  if (isPlainObject(obj)) {
    // eslint-disable-next-line guard-for-in
    for (let property in obj) {
      let value = obj[property];
      if (!isSerializable(value)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function isScalar(val) {
  return (
    typeof val === 'undefined' ||
    typeof val === 'string' ||
    typeof val === 'boolean' ||
    typeof val === 'number' ||
    val === null
  );
}

function isPlainObject(obj) {
  return typeof obj === 'object' && obj.constructor === Object && obj.toString() === '[object Object]';
}

function dropUndefinedKeys(obj) {
  const newObj = {};

  for (const key in obj) {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  }

  return newObj;
}
