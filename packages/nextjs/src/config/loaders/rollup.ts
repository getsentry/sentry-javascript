import commonjs from '@rollup/plugin-commonjs';
import virtual from '@rollup/plugin-virtual';
import { rollup } from 'rollup';

const SENTRY_WRAPPER_MODULE_NAME = 'sentry-wrapper-module';
const WRAPEE_MODULE_NAME = '__SENTRY_WRAPEE__.cjs';

/**
 * Use Rollup to process the proxy module code, in order to split its `export * from '<wrapped file>'` call into
 * individual exports (which nextjs seems to need).
 *
 * Note: This function may throw in case something goes wrong while bundling.
 *
 * @param templateCode The wrapper module code
 * @param userModuleCode The path to the file being wrapped
 * @returns The processed proxy module code
 */
export async function rollupize(templateCode: string, userModuleCode: string): Promise<string> {
  const rollupBuild = await rollup({
    input: SENTRY_WRAPPER_MODULE_NAME,

    plugins: [
      // We're using virtual modules so we don't have to mess around with file paths
      virtual({
        [SENTRY_WRAPPER_MODULE_NAME]: templateCode,
        [WRAPEE_MODULE_NAME]: userModuleCode,
      }),

      // People may use `module.exports` in their API routes or page files. Next.js allows that and we also need to
      // handle that correctly so we let a plugin to take care of bundling cjs exports for us.
      commonjs(),
    ],

    // We only want to bundle our wrapper module and the wrappee module into one, so we mark everything else as external.
    external: source => source !== SENTRY_WRAPPER_MODULE_NAME && source !== WRAPEE_MODULE_NAME,

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

    onwarn: () => {
      // Suppress all warnings - we don't want to bother people with this output
    },

    output: {
      interop: 'auto',
      exports: 'named',
    },
  });

  const finalBundle = await rollupBuild.generate({
    format: 'esm',
  });

  // The module at index 0 is always the entrypoint, which in this case is the proxy module.
  return finalBundle.output[0].code;
}
