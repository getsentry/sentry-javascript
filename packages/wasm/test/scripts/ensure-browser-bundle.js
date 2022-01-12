const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureBrowserBundle() {
  const browserPackageDir = path.resolve(__dirname, '../../../browser');
  if (!fs.existsSync(path.resolve(browserPackageDir, 'build/bundle.js'))) {
    // eslint-disable-next-line no-console
    console.warn('\nWARNING: Missing browser bundle. Bundle will be created before running wasm integration tests.');
    execSync(`pushd ${browserPackageDir} && yarn build:bundle && popd`);
  }
}

ensureBrowserBundle();
