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
try {
  if (!fs.existsSync(path.resolve(BUILD_DIR))) {
    console.error(`Directory ${BUILD_DIR} DOES NOT exist`);
    console.error("This script should only be executed after you've run `yarn build`.");
    process.exit(1);
  }
} catch (error) {
  console.error(`Error while looking up directory ${BUILD_DIR}`);
  process.exit(1);
}

// copy non-code assets to build dir
ASSETS.forEach(asset => {
  const assetPath = path.resolve(asset);
  try {
    if (!fs.existsSync(assetPath)) {
      console.error(`Asset ${asset} does not exist.`);
      process.exit(1);
    }
    fs.copyFileSync(assetPath, path.resolve(BUILD_DIR, asset));
  } catch (error) {
    console.error(`Error while copying ${asset} to ${BUILD_DIR}`);
    process.exit(1);
  }
});

// package.json modifications
const packageJsonPath = path.resolve(BUILD_DIR, 'package.json');
const pkgJson: { [key: string]: unknown } = require(packageJsonPath);

// modify entry points to point to correct paths (i.e. strip out the build directory)
ENTRY_POINTS.filter(entryPoint => pkgJson[entryPoint]).forEach(entryPoint => {
  pkgJson[entryPoint] = (pkgJson[entryPoint] as string).replace(`${BUILD_DIR}/`, '');
});

delete pkgJson.scripts;
delete pkgJson.volta;

// write modified package.json to file (pretty-printed with 2 spaces)
try {
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJson, null, 2));
} catch (error) {
  console.error(`Error while writing package.json to disk`);
  process.exit(1);
}

console.log(`\nSuccessfully finished postbuild commands for ${pkgJson.name}`);
