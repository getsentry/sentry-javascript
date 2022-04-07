/* eslint-disable no-console */
/*
  This script prepares the central `build` directory for NPM package creation.
  It first copies all non-code files into the `build` directory, including `package.json`, which
  is edited to adjust entry point paths. These corrections are performed so that the paths align with
  the directory structure inside `build`.
*/

import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';

const BUILD_DIR = 'build';
const NPM_BUILD_DIR = 'build/npm';
const NPM_LEGACY_BUILD_DIR = 'build/npm-legacy';

const NPM_IGNORE = fs.existsSync('.npmignore') ? '.npmignore' : '../../.npmignore';
const ASSETS = ['README.md', 'LICENSE', NPM_IGNORE];
const ENTRY_POINTS = ['main', 'module', 'types', 'browser'];

const packageWithBundles = process.argv.includes('--bundles');
const shouldPrepareLegacyPackage = process.argv.includes('--legacyPackage');

const buildDir = packageWithBundles ? NPM_BUILD_DIR : BUILD_DIR;

if (shouldPrepareLegacyPackage && !packageWithBundles) {
  console.error('Error: --legacyPackage flag can only be used in combination with --bundles!');
  process.exit(1);
}

// check if build dir exists
try {
  if (!fs.existsSync(path.resolve(buildDir))) {
    console.error(`Directory ${buildDir} DOES NOT exist`);
    console.error("This script should only be executed after you've run `yarn build`.");
    process.exit(1);
  }
} catch (error) {
  console.error(`Error while looking up directory ${buildDir}`);
  process.exit(1);
}

if (shouldPrepareLegacyPackage) {
  // check if legacy build dir exists
  try {
    if (!fs.existsSync(path.resolve(NPM_LEGACY_BUILD_DIR))) {
      console.error(`Directory ${NPM_LEGACY_BUILD_DIR} DOES NOT exist`);
      console.error('Legacy files have not been built yet. Have you run "yarn:build"?');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error while looking up directory ${NPM_LEGACY_BUILD_DIR}`);
    process.exit(1);
  }
}

// copy non-code assets to build dir
function copyAssets(target: string): void {
  ASSETS.forEach(asset => {
    const assetPath = path.resolve(asset);
    try {
      if (!fs.existsSync(assetPath)) {
        console.error(`Asset ${asset} does not exist.`);
        process.exit(1);
      }

      const assetFileName = path.basename(assetPath);
      fs.copyFileSync(assetPath, path.resolve(target, assetFileName));
    } catch (error) {
      console.error(`Error while copying ${asset} to ${target}`, error);
      process.exit(1);
    }
  });
}

copyAssets(buildDir);

if (shouldPrepareLegacyPackage) {
  copyAssets(NPM_LEGACY_BUILD_DIR);
}

// TODO remove in v7! Until then:
// copy CDN bundles into npm dir to temporarily keep bundles in npm tarball
// inside the tarball, they are located in `build/`
// for now, copy it by default, unless explicitly forbidden via an command line arg
const tmpCopyBundles = packageWithBundles && !process.argv.includes('--skipBundleCopy');
if (tmpCopyBundles) {
  const npmTmpBundlesPath = path.resolve(buildDir, 'build');
  const cdnBundlesPath = path.resolve('build', 'bundles');
  try {
    if (!fs.existsSync(npmTmpBundlesPath)) {
      fs.mkdirSync(npmTmpBundlesPath);
    }
    void fse.copy(cdnBundlesPath, npmTmpBundlesPath);
  } catch (error) {
    console.error(`Error while tmp copying CDN bundles to ${buildDir}`);
    process.exit(1);
  }
}
// end remove

const packageJsonPath = path.resolve('package.json');
const pkgJson: { [key: string]: unknown } = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf8' }));

function getModifiedPkgJson(newName: string, removeDependencies?: boolean): Record<string, unknown> {
  const newPkgJson = { ...pkgJson };
  newPkgJson.name = newName;

  delete newPkgJson.scripts;
  delete newPkgJson.volta;
  delete newPkgJson.jest;

  if (removeDependencies) {
    newPkgJson.dependencies = {};
  }

  // modify entry points to point to correct paths (i.e. strip out the build directory)
  ENTRY_POINTS.forEach(entryPoint => {
    const oldEntryPoint = pkgJson[entryPoint] as string | undefined;
    if (oldEntryPoint) {
      newPkgJson[entryPoint] = path.relative(buildDir, oldEntryPoint);
    }
  });

  return newPkgJson;
}

// write modified package.json to new location
try {
  const modifiedPkgJson = getModifiedPkgJson(pkgJson.name as string);
  const modifiedPkgJsonPath = path.resolve(buildDir, 'package.json');
  fs.writeFileSync(modifiedPkgJsonPath, JSON.stringify(modifiedPkgJson, null, 2));
} catch (error) {
  console.error('Error while writing package.json to disk');
  process.exit(1);
}

// write modified package.json for legacy package to new location
if (shouldPrepareLegacyPackage) {
  try {
    const modifiedPkgJson = getModifiedPkgJson(`${pkgJson.name}-legacy`, true);
    const modifiedPkgJsonPath = path.resolve(NPM_LEGACY_BUILD_DIR, 'package.json');
    fs.writeFileSync(modifiedPkgJsonPath, JSON.stringify(modifiedPkgJson, null, 2));
  } catch (error) {
    console.error('Error while writing legacy package.json to disk');
    process.exit(1);
  }
}

async function runPackagePrepack(packagePrepackPath: string): Promise<void> {
  const { prepack } = await import(packagePrepackPath);
  if (prepack && typeof prepack === 'function') {
    const isSuccess = prepack(buildDir);
    if (!isSuccess) {
      process.exit(1);
    }
  } else {
    console.error(`Could not find a prepack function in ${packagePrepackPath}.`);
    console.error(
      'Make sure, your package-specific prepack script exports `function prepack(buildDir: string): boolean`.',
    );
    process.exit(1);
  }
}

// execute package specific settings
// 1. check if a package called `<package-root>/scripts/prepack.ts` exitsts
// if yes, 2.) execute that script for things that are package-specific
void (async () => {
  const packagePrepackPath = path.resolve('scripts', 'prepack.ts');
  try {
    if (fs.existsSync(packagePrepackPath)) {
      await runPackagePrepack(packagePrepackPath);
    }
  } catch (error) {
    console.error(`Error while trying to access ${packagePrepackPath.toString()}`);
    process.exit(1);
  }
  console.log(`\nSuccessfully finished prepack commands for ${pkgJson.name}\n`);
})();
