/**
 * Regex Replace plugin docs: https://github.com/jetiny/rollup-plugin-re
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 * Sucrase plugin docs: https://github.com/rollup/plugins/tree/master/packages/sucrase
 */

import * as path from 'path';

// We need both replacement plugins because one handles regex and the other runs both before and after rollup does its
// bundling work.
import regexReplace from 'rollup-plugin-re';
import replace from '@rollup/plugin-replace';
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

/**
 * Create a plugin to switch all instances of `const` to `var`, both to prevent problems when we shadow `global` and
 * because it's fewer characters.
 *
 * Note that the generated plugin runs the replacement both before and after rollup does its code manipulation, to
 * increase the chances that nothing is missed.
 *
 * TODO This is pretty brute-force-y. Perhaps we could switch to using a parser, the way we (will) do for both our jest
 * transformer and the polyfill build script.
 *
 * @returns An instance of the `@rollup/plugin-replace` plugin
 */
export function makeConstToVarPlugin() {
  return replace({
    // TODO `preventAssignment` will default to true in version 5.x of the replace plugin, at which point we can get rid
    // of this. (It actually makes no difference in this case whether it's true or false, since we never assign to
    // `const`, but if we don't give it a value, it will spam with warnings.)
    preventAssignment: true,
    values: {
      // Include a space at the end to guarantee we're not accidentally catching the beginning of the words "constant,"
      // "constantly," etc.
      'const ': 'var ',
    },
  });
}

/**
 * Create a plugin which can be used to pause the build process at the given hook.
 *
 * Hooks can be found here: https://rollupjs.org/guide/en/#build-hooks
 *
 * @param hookName The name of the hook at which to pause.
 * @returns A plugin which inserts a debugger statement in the phase represented by the given hook
 */
export function makeDebuggerPlugin(hookName) {
  return {
    name: 'debugger-plugin',
    [hookName]: () => {
      // eslint-disable-next-line no-debugger
      debugger;
      return null;
    },
  };
}

/**
 * Create a plugin to strip eslint-style comments from the output.
 *
 * @returns A `rollup-plugin-re` instance.
 */
export function makeRemoveESLintCommentsPlugin() {
  return regexReplace({
    patterns: [
      {
        test: /\/[/*] eslint-disable.*\n/g,
        replace: '',
      },
    ],
  });
}

/**
 * Create a plugin to strip multiple consecutive blank lines, with or without whitespace in them. from the output.
 *
 * @returns A `rollup-plugin-re` instance.
 */
export function makeRemoveBlankLinesPlugin() {
  return regexReplace({
    patterns: [
      {
        test: /\n(\n\s*)+\n/g,
        replace: '\n\n',
      },
    ],
  });
}

/**
 * Create a plugin to manually add packages to a build's watch.
 *
 * @param watchPackages The packages to watch. Shouldn't include any transitive dependencies, even if they're also
 * direct dependencies. (In other words, if A depends on B and C, and B depends on C, then A should only list B, not C.)
 *
 * TODO: This currently only works when running `build:watch` or `build:dev:watch` at the repo level, no the individual
 * package level.
 * @returns
 */
export function makeWatchDependenciesPlugin(watchPackages) {
  // Unlike tsc, rollup doesn't seem to be able to follow the symlinks yarn workspaces uses to link our packages into
  // one another, with the result that changes don't automatically cascade in watch mode. This plugin sets that up
  // manually, with the twist that transitive dependencies aren't included.(TODO This is what makes it only work at the
  // repo level.)
  //
  // For example, if you look at their respective `package.json`s, you'll see the following dependencies:
  //
  //  @sentry/hub -> @sentry/utils, @sentry/types
  //  @sentry/utils -> @sentry/types
  //  @sentry/types -> (none)
  //
  // The naive solution (and the one which it appears tsc uses) would therefore be to have `@sentry/hub`'s build watch
  // `packages/utils` and `packages/types` for changes and `@sentry/utils`'s build watch `packages/types` for changes.
  // Under that scenario, though, a change to `@sentry/types` would trigger three rebuilds rather than two: a rebuild of
  // both `@sentry/hub` and `@sentry/utils` because the contents of `packages/types` would have changed, and then
  // another rebuild of `@sentry/hub` because the contents of `packags/utils` would have changed. Remove
  // `packages/types` from `@sentry/hub`'s watch list, though, and each package is only rebuilt once, which makes the
  // overall process faster.
  //
  // TODO: At the moment this filtering has to be done by hand, with the resulting watch list hardcoded into each
  // package's rollup config. While the values in those lists are likely to be highly stable over time, there's also no
  // mechanism to guarantee that changes in a package's intra-package dependencies will be reflected in the lists. It
  // shouldn't be that hard to write a script to generate the correct lists at build time (or at least a test to check
  // for the hardcoded lists' correctness in CI) though.
  return {
    name: 'watch-dependencies',
    buildStart: function () {
      if (this.meta.watchMode) {
        const cwd = process.cwd();
        watchPackages.forEach(pkg => this.addWatchFile(path.resolve(cwd, `../${pkg}`)));
      }
    },
  };
}

export { makeExtractPolyfillsPlugin } from './extractPolyfillsPlugin.js';
