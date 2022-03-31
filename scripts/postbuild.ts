/*
  This script prepares the central `build` directory for NPM package creation.
  It first copies all non-code files into the `build` directory, including `package.json` which
  is edited to adjust entry point paths. These corrections are performed so that they align with
  the directory structure inside `build`.
*/

import * as fs from 'fs';

import * as path from 'path';

const BUILD_DIR = 'build';
const ASSETS = ['README.md', 'LICENSE', 'package.json', '.npmignore'];
const ENTRY_POINTS = ['main', 'module', 'types'];

// check if build dirs exists
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
const pkg: { [key: string]: string } = require(packageJsonPath);

// modify entry points to point to correct paths (i.e. delete the build directory)
ENTRY_POINTS.filter(entryPoint => !!pkg[entryPoint]).forEach(entryPoint => {
  pkg[entryPoint] = pkg[entryPoint].replace(`${BUILD_DIR}/`, '');
});

// TODO decide if we want this:
delete pkg.scripts;
delete pkg.volta;

// write modified package.json to file
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

console.log('Successfully finished postbuild commands');
