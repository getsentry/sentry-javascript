import fs from 'node:fs';

/**
 * Outputs a package.json file with {type: module} in the root of the output directory so that Node
 * treats .js files as ESM.
 */
export function makePackageNodeEsm() {
  return {
    name: 'make-package-node-esm',
    async generateBundle() {
      // We need to keep the `sideEffects` value from the original package.json,
      // as e.g. webpack seems to depend on this
      // without this, tree shaking does not work as expected
      const packageJSONPath = (await this.resolve('package.json')).id;

      const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));
      const sideEffects = packageJSON.sideEffects;

      const newPackageJSON = {
        type: 'module',
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
