const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureBrowserBundle() {
  const browserPackageDir = path.resolve(__dirname, '../../../browser');
  if (!fs.existsSync(path.resolve(browserPackageDir, 'build/bundles/bundle.js'))) {
    // eslint-disable-next-line no-console
    console.warn('\nWARNING: Missing browser bundle. Bundle will be created before running wasm integration tests.');
    execSync(`cd ${browserPackageDir} && yarn build:bundle && popd`);
  }
}

function ensureWasmBundle() {
  if (!fs.existsSync('build/bundles/wasm.js')) {
    // eslint-disable-next-line no-console
    console.warn('\nWARNING: Missing wasm bundle. Bundle will be created before running wasm integration tests.');
    execSync('yarn build:bundle');
  }
}

ensureBrowserBundle();
ensureWasmBundle();
