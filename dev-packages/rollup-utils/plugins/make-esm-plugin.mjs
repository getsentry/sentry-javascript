import fs from 'node:fs';
import path from 'node:path';

/**
 * Outputs a package.json file with {type: module} in the root of the output directory so that Node
 * treats .js files as ESM.
 */
export function makePackageNodeEsm() {
  return {
    name: 'make-package-node-esm',
    async generateBundle(options) {
      // We need to keep the `sideEffects` value from the original package.json,
      // as e.g. webpack seems to depend on this
      // without this, tree shaking does not work as expected
      const packageJSONPath = (await this.resolve('package.json')).id;

      const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));
      const sideEffects = scopeSideEffectsToOutputDir(
        packageJSON.sideEffects,
        path.relative(path.dirname(packageJSONPath), options.dir),
      );
      // For module federation we need to keep the version of the package
      const version = packageJSON.version;

      const newPackageJSON = {
        type: 'module',
        version,
        sideEffects,
      };

      this.emitFile({
        type: 'asset',
        fileName: 'package.json',
        source: JSON.stringify(newPackageJSON),
      });
    },
  };
}

/**
 * Bundlers resolve `sideEffects` globs against the *nearest* package.json, and the file we emit here
 * is nearer than the package's own for everything under the output directory. So a path list written
 * relative to the package root (`./build/esm/vendored/foo/**`) would silently match nothing once it
 * lands here. Re-anchor the entries that point into this output directory and drop the rest, which
 * belong to sibling outputs (`./build/cjs/...`) still covered by the package's own package.json.
 *
 * A boolean `sideEffects` needs none of this and is passed through untouched.
 *
 * @param {boolean | string[] | undefined} sideEffects The package's own `sideEffects` value.
 * @param {string} outputDir The output directory, relative to the package root.
 */
function scopeSideEffectsToOutputDir(sideEffects, outputDir) {
  if (!Array.isArray(sideEffects)) {
    return sideEffects;
  }

  const prefix = `./${outputDir}/`;

  return sideEffects.filter(entry => entry.startsWith(prefix)).map(entry => `./${entry.slice(prefix.length)}`);
}
