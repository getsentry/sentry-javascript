/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-console */

/*
  THIS IS ONLY TEMPORARILY HERE
  This file is originally from the sentry-javascript repo. It's only here to ease
  migration into the monorepo and will be removed once the migration is complete.
  TODO: Delete once migrated to sentry-javascript
*/

/*
  This script prepares the central `build` directory for NPM package creation.
  It first copies all non-code files into the `build` directory, including `package.json`, which
  is edited to adjust entry point paths. These corrections are performed so that the paths align with
  the directory structure inside `build`.
*/

const fs = require('fs');
const path = require('path');

const NPM_BUILD_DIR = 'build/npm';
const BUILD_DIR = 'build';

const ASSETS = ['README.md', 'LICENSE', 'package.json'];
const ENTRY_POINTS = ['main', 'module', 'types', 'browser'];

const packageWithBundles = process.argv.includes('--bundles');
const buildDir = packageWithBundles ? NPM_BUILD_DIR : BUILD_DIR;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgJson: { [key: string]: unknown } = require(path.resolve('package.json'));

// check if build dir exists
if (!fs.existsSync(path.resolve(buildDir))) {
  console.error(`\nERROR: Directory '${buildDir}' does not exist in ${pkgJson.name}.`);
  console.error("This script should only be executed after you've run `yarn build`.");
  process.exit(1);
}

// copy non-code assets to build dir
ASSETS.forEach(asset => {
  const assetPath = path.resolve(asset);
  if (!fs.existsSync(assetPath)) {
    console.error(`\nERROR: Asset '${asset}' does not exist.`);
    process.exit(1);
  }
  const destinationPath = path.resolve(buildDir, path.basename(asset));
  console.log(`Copying ${path.basename(asset)} to ${path.relative('../..', destinationPath)}.`);
  fs.copyFileSync(assetPath, destinationPath);
});

// package.json modifications
const newPackageJsonPath = path.resolve(buildDir, 'package.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const newPkgJson: { [key: string]: unknown } = require(newPackageJsonPath);

// modify entry points to point to correct paths (i.e. strip out the build directory)
ENTRY_POINTS.filter(entryPoint => newPkgJson[entryPoint]).forEach(entryPoint => {
  newPkgJson[entryPoint] = (newPkgJson[entryPoint] as string).replace(`${buildDir}/`, '');
});

delete newPkgJson.scripts;
delete newPkgJson.volta;
delete newPkgJson.jest;

// write modified package.json to file (pretty-printed with 2 spaces)
try {
  fs.writeFileSync(newPackageJsonPath, JSON.stringify(newPkgJson, null, 2));
} catch (error) {
  console.error(`\nERROR: Error while writing modified 'package.json' to disk in ${pkgJson.name}:\n`, error);
  process.exit(1);
}
