const path = require('path');
const webpack = require('webpack');
const { execSync } = require('child_process');

// Webpack test does not work in Node 18 and above.
if (Number(process.versions.node.split('.')[0]) >= 18) {
  process.exit(0);
}

// biome-ignore format: Follow-up for prettier
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
  function (err, stats) {
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
    execSync('node ' + path.resolve(__dirname, 'dist', 'bundle.js'), { stdio: 'inherit' });
  } catch (_) {
    process.exit(1);
  }
}
