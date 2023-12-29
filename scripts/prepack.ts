/* eslint-disable no-console */
/*
  This script prepares the central `build` directory for NPM package creation.
  It first copies all non-code files into the `build` directory, including `package.json`, which
  is edited to adjust entry point paths. These corrections are performed so that the paths align with
  the directory structure inside `build`.
*/

import * as fs from 'fs';
import * as path from 'path';

const NPM_BUILD_DIR = 'build/npm';
const BUILD_DIR = 'build';
const NPM_IGNORE = fs.existsSync('.npmignore') ? '.npmignore' : '../../.npmignore';

const ASSETS = ['README.md', 'LICENSE', 'package.json', NPM_IGNORE] as const;
const ENTRY_POINTS = ['main', 'module', 'types', 'browser'] as const;
const CONDITIONAL_EXPORT_ENTRY_POINTS = ['import', 'require', ...ENTRY_POINTS] as const;
const EXPORT_MAP_ENTRY_POINT = 'exports';
const TYPES_VERSIONS_ENTRY_POINT = 'typesVersions';

const packageWithBundles = process.argv.includes('--bundles');
const buildDir = packageWithBundles ? NPM_BUILD_DIR : BUILD_DIR;

type PackageJsonEntryPoints = Record<(typeof ENTRY_POINTS)[number], string>;
type ConditionalExportEntryPoints = Record<(typeof CONDITIONAL_EXPORT_ENTRY_POINTS)[number], string>;

interface TypeVersions {
  [key: string]: {
    [key: string]: string[];
  };
}

type PackageJsonExports = Partial<ConditionalExportEntryPoints> & {
  [key: string]: Partial<ConditionalExportEntryPoints>;
};

interface PackageJson extends Record<string, unknown>, PackageJsonEntryPoints {
  [EXPORT_MAP_ENTRY_POINT]: PackageJsonExports;
  [TYPES_VERSIONS_ENTRY_POINT]: TypeVersions;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgJson: PackageJson = require(path.resolve('package.json'));

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
const newPkgJson: PackageJson = require(newPackageJsonPath);

// modify entry points to point to correct paths (i.e. strip out the build directory)
ENTRY_POINTS.filter(entryPoint => newPkgJson[entryPoint]).forEach(entryPoint => {
  newPkgJson[entryPoint] = newPkgJson[entryPoint].replace(`${buildDir}/`, '');
});

/**
 * Recursively traverses the exports object and rewrites all string values to remove the build directory.
 */
function rewriteConditionalExportEntryPoint(
  exportsObject: Record<string, string | Record<string, string>>,
  key: string,
): void {
  const exportsField = exportsObject[key];
  if (typeof exportsField === 'string') {
    exportsObject[key] = exportsField.replace(`${buildDir}/`, '');
    return;
  }
  Object.keys(exportsField).forEach(subfieldKey => {
    rewriteConditionalExportEntryPoint(exportsField, subfieldKey);
  });
}

if (newPkgJson[EXPORT_MAP_ENTRY_POINT]) {
  Object.keys(newPkgJson[EXPORT_MAP_ENTRY_POINT]).forEach(key => {
    rewriteConditionalExportEntryPoint(newPkgJson[EXPORT_MAP_ENTRY_POINT], key);
  });
}

if (newPkgJson[TYPES_VERSIONS_ENTRY_POINT]) {
  Object.entries(newPkgJson[TYPES_VERSIONS_ENTRY_POINT]).forEach(([key, val]) => {
    newPkgJson[TYPES_VERSIONS_ENTRY_POINT][key] = Object.entries(val).reduce(
      (acc, [key, val]) => {
        const newKey = key.replace(`${buildDir}/`, '');
        acc[newKey] = val.map(v => v.replace(`${buildDir}/`, ''));
        return acc;
      },
      {} as Record<string, string[]>,
    );
  });
}

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

async function runPackagePrepack(packagePrepackPath: string): Promise<void> {
  const { prepack } = await import(packagePrepackPath);
  if (prepack && typeof prepack === 'function') {
    const isSuccess = prepack(buildDir);
    if (!isSuccess) {
      process.exit(1);
    }
  } else {
    console.error(`\nERROR: Could not find a \`prepack\` function in './scripts/prepack.ts' in ${pkgJson.name}.`);
    console.error(
      'Make sure your package-specific prepack script exports `function prepack(buildDir: string): boolean`.',
    );
    process.exit(1);
  }
}

// execute package specific settings
// 1. check if a script called `<package-root>/scripts/prepack.ts` exists
// if yes, 2.) execute that script for things that are package-specific
async function runPackageSpecificScripts(): Promise<void> {
  const packagePrepackPath = path.resolve('scripts', 'prepack.ts');
  try {
    if (fs.existsSync(packagePrepackPath)) {
      await runPackagePrepack(packagePrepackPath);
    }
  } catch (error) {
    console.error(`\nERROR: Error while trying to load and run ./scripts/prepack.ts in ${pkgJson.name}:\n`, error);
    process.exit(1);
  }
  console.log(`\nSuccessfully finished prepack commands for ${pkgJson.name}\n`);
}

void runPackageSpecificScripts();
