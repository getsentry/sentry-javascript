/* eslint-disable no-console */

/**
 * This script prepares the central `build` directory for NPM package creation.
 * It first copies all non-code files into the `build` directory, including `package.json`, which
 * is edited to adjust entry point paths. These corrections are performed so that the paths align with
 * the directory structure inside `build`.
 *
 * TODO(v9): Remove this script and change the Deno SDK to import from build/X.
 */

const fs = require('node:fs');
const path = require('node:path');

const BUILD_DIR = 'build';

const ENTRY_POINTS = ['main', 'module', 'types', 'browser'];
const EXPORT_MAP_ENTRY_POINT = 'exports';
const TYPES_VERSIONS_ENTRY_POINT = 'typesVersions';

const ASSETS = ['README.md', 'LICENSE', 'package.json', '.npmignore'];

const PACKAGE_JSON = 'package.json';

/**
 * @typedef {Record<(typeof ENTRY_POINTS)[number], string>} PackageJsonEntryPoints - an object containing module details
 */

/**
 * @typedef {Record<string, string>} ConditionalExportEntryPoints - an object containing module details
 */

/**
 * @typedef {Record<string, Record<string, string[]>>} TypeVersions - an object containing module details
 */

/**
 * @typedef {Partial<ConditionalExportEntryPoints> & Record<string, Partial<ConditionalExportEntryPoints>>} PackageJsonExports - types for `package.json` exports
 */

/**
 * @typedef {Record<string, unknown> & PackageJsonEntryPoints & {[EXPORT_MAP_ENTRY_POINT]: PackageJsonExports} & {[TYPES_VERSIONS_ENTRY_POINT]: TypeVersions}} PackageJson - types for `package.json`
 */

/**
 * @type {PackageJson}
 */
const pkgJson = require(path.resolve(PACKAGE_JSON));

// check if build dir exists
if (!fs.existsSync(path.resolve(BUILD_DIR))) {
  console.error(`\nERROR: Directory '${BUILD_DIR}' does not exist in ${pkgJson.name}.`);
  console.error("This script should only be executed after you've run `yarn build`.");
  process.exit(1);
}

const buildDirContents = fs.readdirSync(path.resolve(BUILD_DIR));

// copy non-code assets to build dir
ASSETS.forEach(asset => {
  const assetPath = path.resolve(asset);
  if (fs.existsSync(assetPath)) {
    const destinationPath = path.resolve(BUILD_DIR, path.basename(asset));
    console.log(`Copying ${path.basename(asset)} to ${path.relative('../..', destinationPath)}.`);
    fs.copyFileSync(assetPath, destinationPath);
  }
});

// package.json modifications
const newPackageJsonPath = path.resolve(BUILD_DIR, PACKAGE_JSON);

/**
 * @type {PackageJson}
 */
const newPkgJson = require(newPackageJsonPath);

// modify entry points to point to correct paths (i.e. strip out the build directory)
ENTRY_POINTS.filter(entryPoint => newPkgJson[entryPoint]).forEach(entryPoint => {
  newPkgJson[entryPoint] = newPkgJson[entryPoint].replace(`${BUILD_DIR}/`, '');
});

/**
 * Recursively traverses the exports object and rewrites all string values to remove the build directory.
 *
 * @param {PackageJsonExports} exportsObject - the exports object to traverse
 * @param {string} key - the key of the current exports object
 */
function rewriteConditionalExportEntryPoint(exportsObject, key) {
  const exportsField = exportsObject[key];
  if (!exportsField) {
    return;
  }

  if (typeof exportsField === 'string') {
    exportsObject[key] = exportsField.replace(`${BUILD_DIR}/`, '');
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
    newPkgJson[TYPES_VERSIONS_ENTRY_POINT][key] = Object.entries(val).reduce((acc, [key, val]) => {
      const newKey = key.replace(`${BUILD_DIR}/`, '');
      acc[newKey] = val.map(v => v.replace(`${BUILD_DIR}/`, ''));
      return acc;
    }, {});
  });
}

newPkgJson.files = buildDirContents;

// write modified package.json to file (pretty-printed with 2 spaces)
try {
  fs.writeFileSync(newPackageJsonPath, JSON.stringify(newPkgJson, null, 2));
} catch (error) {
  console.error(`\nERROR: Error while writing modified ${PACKAGE_JSON} to disk in ${pkgJson.name}:\n`, error);
  process.exit(1);
}
