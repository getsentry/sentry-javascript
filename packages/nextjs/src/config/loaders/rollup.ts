import sucrase from '@rollup/plugin-sucrase';
import virtual from '@rollup/plugin-virtual';
import { escapeStringForRegex } from '@sentry/utils';
import * as path from 'path';
import type { InputOptions as RollupInputOptions, OutputOptions as RollupOutputOptions } from 'rollup';
import { rollup } from 'rollup';

const SENTRY_PROXY_MODULE_NAME = 'sentry-proxy-module';

const getRollupInputOptions = (templateCode: string, userModulePath: string): RollupInputOptions => ({
  input: SENTRY_PROXY_MODULE_NAME,

  plugins: [
    virtual({
      [SENTRY_PROXY_MODULE_NAME]: templateCode,
    }),

    sucrase({
      transforms: ['jsx', 'typescript'],
    }),
  ],

  // We want to process as few files as possible, so as not to slow down the build any more than we have to. We need the
  // proxy module (living in the temporary file we've created) and the file we're wrapping not to be external, because
  // otherwise they won't be processed. (We need Rollup to process the former so that we can use the code, and we need
  // it to process the latter so it knows what exports to re-export from the proxy module.) Past that, we don't care, so
  // don't bother to process anything else.
  external: importPath => importPath !== SENTRY_PROXY_MODULE_NAME && importPath !== userModulePath,

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
  // Setting `makeAbsoluteExternalsRelative` to `false` prevents all of the above by causing Rollup to ignore imports of
  // externals entirely, with the result that their paths remain untouched (which is what we want).
  makeAbsoluteExternalsRelative: false,
});

const rollupOutputOptions: RollupOutputOptions = {
  format: 'esm',

  // Don't create a bundle - we just want the transformed entrypoint file
  preserveModules: true,
};

/**
 * Use Rollup to process the proxy module code, in order to split its `export * from '<wrapped file>'` call into
 * individual exports (which nextjs seems to need).
 *
 * Note: Any errors which occur are handled by the proxy loader which calls this function.
 *
 * @param templateCode The proxy module code
 * @param userModulePath The path to the file being wrapped
 * @returns The processed proxy module code
 */
export async function rollupize(templateCode: string, userModulePath: string): Promise<string> {
  const intermediateBundle = await rollup(getRollupInputOptions(templateCode, userModulePath));
  const finalBundle = await intermediateBundle.generate(rollupOutputOptions);

  // The module at index 0 is always the entrypoint, which in this case is the proxy module.
  let { code } = finalBundle.output[0];

  // In addition to doing the desired work, Rollup also does a few things we *don't* want. Specifically, in messes up
  // the path in both `import * as origModule from '<userModulePath>'` and `export * from '<userModulePath>'`.
  //
  // - It turns the square brackets surrounding each parameterized path segment into underscores.
  // - It always adds `.js` to the end of the filename.
  // - It converts the path from aboslute to relative, which would be fine except that when used with the virual plugin,
  //   it uses an incorrect (and not entirely predicable) base for that relative path.
  //
  // To fix this, we overwrite the messed up path with what we know it should be: `./<userModulePathBasename>`. (We can
  // find the value of the messed up path by looking at what `import * as origModule from '<userModulePath>'` becomes.
  // Because it's the first line of the template, it's also the first line of the result, and is therefore easy to
  // find.)

  const importStarStatement = code.split('\n')[0];
  // This regex should always match (we control both the input and the process which generates it, so we can guarantee
  // the outcome of that processing), but just in case it somehow doesn't, we need it to throw an error so that the
  // proxy loader will know to return the user's code untouched rather than returning proxy module code including a
  // broken path. The non-null assertion asserts that a match has indeed been found.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const messedUpPath = /^import \* as .* from '(.*)';$/.exec(importStarStatement)![1];

  code = code.replace(new RegExp(escapeStringForRegex(messedUpPath), 'g'), `./${path.basename(userModulePath)}`);

  return code;
}
