import sucrase from '@rollup/plugin-sucrase';
import * as path from 'path';
import type { InputOptions as RollupInputOptions, OutputOptions as RollupOutputOptions } from 'rollup';
import { rollup } from 'rollup';

const getRollupInputOptions = (proxyPath: string, resourcePath: string): RollupInputOptions => ({
  input: proxyPath,

  plugins: [
    sucrase({
      transforms: ['jsx', 'typescript'],
    }),
  ],

  // We want to process as few files as possible, so as not to slow down the build any more than we have to. We need the
  // proxy module (living in the temporary file we've created) and the file we're wrapping not to be external, because
  // otherwise they won't be processed. (We need Rollup to process the former so that we can use the code, and we need
  // it to process the latter so it knows what exports to re-export from the proxy module.) Past that, we don't care, so
  // don't bother to process anything else.
  external: importPath => importPath !== proxyPath && importPath !== resourcePath,

  // Prevent rollup from stressing out about TS's use of global `this` when polyfilling await. (TS will polyfill if the
  // user's tsconfig `target` is set to anything before `es2017`. See https://stackoverflow.com/a/72822340 and
  // https://stackoverflow.com/a/60347490.)
  context: 'this',

  // Rollup's path-resolution logic when handling re-exports can go wrong when wrapping pages which aren't at the root
  // level of the `pages` directory. This may be a bug, as it doesn't match the behavior described in the docs, but what
  // seems to happen is this:
  //
  //   - We try to wrap `pages/xyz/userPage.js`, which contains `export { helperFunc } from '../../utils/helper'`
  //   - Rollup converts '../../utils/helper' into an absolute path
  //   - We mark the helper module as external
  //   - Rollup then converts it back to a relative path, but relative to `pages/` rather than `pages/xyz/`. (This is
  //     the part which doesn't match the docs. They say that Rollup will use the common ancestor of all modules in the
  //     bundle as the basis for the relative path calculation, but both our temporary file and the page being wrapped
  //     live in `pages/xyz/`, and they're the only two files in the bundle, so `pages/xyz/`` should be used as the
  //     root. Unclear why it's not.)
  //   - As a result of the miscalculation, our proxy module will include `export { helperFunc } from '../utils/helper'`
  //     rather than the expected `export { helperFunc } from '../../utils/helper'`, thereby causing a build error in
  //     nextjs..
  //
  // It's not 100% clear why, but telling it not to do the conversion back from absolute to relative (by setting
  // `makeAbsoluteExternalsRelative` to `false`) seems to also prevent it from going from relative to absolute in the
  // first place, with the result that the path remains untouched (which is what we want.)
  makeAbsoluteExternalsRelative: false,
});

const rollupOutputOptions: RollupOutputOptions = {
  format: 'esm',

  // Don't create a bundle - we just want the transformed entrypoint file
  preserveModules: true,
};

/**
 * Use Rollup to process the proxy module file (located at `tempProxyFilePath`) in order to split its `export * from
 * '<wrapped file>'` call into individual exports (which nextjs seems to need).
 *
 * Note: Any errors which occur are handled by the proxy loader which calls this function.
 *
 * @param tempProxyFilePath The path to the temporary file containing the proxy module code
 * @param resourcePath The path to the file being wrapped
 * @returns The processed proxy module code
 */
export async function rollupize(tempProxyFilePath: string, resourcePath: string): Promise<string> {
  const intermediateBundle = await rollup(getRollupInputOptions(tempProxyFilePath, resourcePath));
  const finalBundle = await intermediateBundle.generate(rollupOutputOptions);

  // The module at index 0 is always the entrypoint, which in this case is the proxy module.
  let { code } = finalBundle.output[0];

  // Rollup does a few things to the code we *don't* want. Undo those changes before returning the code.
  //
  // Nextjs uses square brackets surrounding a path segment to denote a parameter in the route, but Rollup turns those
  // square brackets into underscores. Further, Rollup adds file extensions to bare-path-type import and export sources.
  // Because it assumes that everything will have already been processed, it always uses `.js` as the added extension.
  // We need to restore the original name and extension so that Webpack will be able to find the wrapped file.
  const resourceFilename = path.basename(resourcePath);
  const mutatedResourceFilename = resourceFilename
    // `[\\[\\]]` is the character class containing `[` and `]`
    .replace(new RegExp('[\\[\\]]', 'g'), '_')
    .replace(/(jsx?|tsx?)$/, 'js');
  code = code.replace(new RegExp(mutatedResourceFilename, 'g'), resourceFilename);

  return code;
}
