/*
  This script prepares the central `build` directory for NPM package creation.
  It first copies all non-code files into the `build` directory, including `package.json`, which
  is edited to adjust entry point paths. These corrections are performed so that the paths align with
  the directory structure inside `build`.
*/

import * as fs from 'fs';

import * as path from 'path';

const BUILD_DIR = 'build';
const ASSETS = ['README.md', 'LICENSE', 'package.json', '.npmignore'];
const ENTRY_POINTS = ['main', 'module', 'types'];

// check if build dir exists
if (!fs.existsSync(BUILD_DIR)) {
  console.error(`Directory ${BUILD_DIR} DOES NOT exist`);
  console.error("This script should only be executed after you've run `yarn build`.");
  process.exit(1);
}

// copy non-code assets to build dir
ASSETS.forEach(asset => {
  if (!fs.existsSync(asset)) {
    console.error(`Asset ${asset} does not exist.`);
    process.exit(1);
  }
  fs.copyFileSync(asset, path.join(BUILD_DIR, asset));
});

// package.json modifications
const packageJsonPath = path.join(process.cwd(), BUILD_DIR, 'package.json');
const pkgJson: { [key: string]: string } = require(packageJsonPath);

// modify entry points to point to correct paths (i.e. strip out the build directory)
ENTRY_POINTS.filter(entryPoint => pkgJson[entryPoint]).forEach(entryPoint => {
  pkgJson[entryPoint] = pkgJson[entryPoint].replace(`${BUILD_DIR}/`, '');
});

// TODO decide if we want this:
delete pkgJson.scripts;
delete pkgJson.volta;

// write modified package.json to file (pretty-printed with 2 spaces)
fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJson, null, 2));

console.log(`\nSuccessfully finished postbuild commands for ${pkgJson.name}`);
