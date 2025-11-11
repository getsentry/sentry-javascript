import fs from 'node:fs';
import path from 'node:path';

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
      const packageJSON = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), './package.json'), { encoding: 'utf8' }),
      );
      const sideEffects = packageJSON.sideEffects;
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

