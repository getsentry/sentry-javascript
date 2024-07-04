import fs from 'node:fs';
import replacePlugin from '@rollup/plugin-replace';

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

/**
 * Makes sure that whenever we add an `react/jsx-runtime` import, we add a `.js` to make the import esm compatible.
 */
export function makeReactEsmJsxRuntimePlugin() {
  return replacePlugin({
    preventAssignment: false,
    sourceMap: true,
    values: {
      'react/jsx-runtime': 'react/jsx-runtime.js',
    },
  });
}
