/**
 * Outputs a package.json file with {type: module} in the root of the output directory so that Node
 * treats .js files as ESM.
 */
export function makePackageNodeEsm() {
  return {
    name: 'make-package-node-esm',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'package.json',
        source: '{ "type": "module", "sideEffects": false }',
      });
    },
  };
}
