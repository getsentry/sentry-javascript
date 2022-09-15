/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const webpack = require('webpack');
const { JSDOM } = require('jsdom');

webpack(
  {
    entry: path.join(__dirname, 'test-code.js'),
    output: {
      path: __dirname,
      filename: 'tmp.js',
    },
    mode: 'development',
  },
  (err, stats) => {
    if (err) {
      console.error(err.stack || err);
      if (err.details) {
        console.error(err.details);
      }
      return;
    }

    const info = stats.toJson();

    if (stats.hasErrors()) {
      console.error(info.errors);
      process.exit(1);
    }

    if (stats.hasWarnings()) {
      console.warn(info.warnings);
      process.exit(1);
    }

    runTests();
  },
);

function runTests() {
  const bundlePath = path.join(__dirname, 'tmp.js');
  const { window } = new JSDOM('', { runScripts: 'dangerously' });

  window.onerror = function () {
    console.error('ERROR thrown in manual test:');
    console.error(arguments);
    console.error('------------------');
    process.exit(1);
  };

  const myLibrary = fs.readFileSync(bundlePath, { encoding: 'utf-8' });

  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = myLibrary;
  window.document.body.appendChild(scriptEl);

  // Testing https://github.com/getsentry/sentry-javascript/issues/2043
  const scriptEl2 = window.document.createElement('script');
  scriptEl2.textContent = myLibrary;
  window.document.body.appendChild(scriptEl2);
  // ------------------------------------------------------------------
}
