/**
 * Sucrase plugin docs: https://github.com/rollup/plugins/tree/master/packages/sucrase
 */

import sucrase from '@rollup/plugin-sucrase';

/**
 * Create a plugin to transpile TS syntax using `sucrase`.
 *
 * @returns An instance of the `@rollup/plugin-sucrase` plugin
 */
export function makeSucrasePlugin() {
  return sucrase({
    transforms: ['typescript', 'jsx'],
  });
}
