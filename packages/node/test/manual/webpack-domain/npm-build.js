const path = require('path');
const webpack = require('webpack');
const { execSync } = require('child_process');

// prettier-ignore
webpack(
  {
    entry: './index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js',
    },
    target: 'node',
    mode: 'development',
  },
  function(err, stats) {
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
  }
);

function runTests() {
  try {
    execSync('node ' + path.resolve(__dirname, 'dist', 'bundle.js'));
  } catch (_) {
    process.exit(1);
  }
}
