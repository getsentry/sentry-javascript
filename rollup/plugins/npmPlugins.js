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
 * Unlike tsc, rollup doesn't seem to be able to follow the symlinks that yarn workspaces uses to link our packages into
 * one another, with the result that changes don't automatically cascade in watch mode. This plugin sets that up
 * manually.
 *
 * TODO: This currently only works when running `build:watch` or `build:dev:watch` at the repo level, not the individual
 * package level.
 *
 * TODO: At the moment, in the interests (current) time and (future) build spped, the watch list for each package is
 * hardcoded into its rollup config. While the values in those lists are likely to be highly stable over time, there's
 * also no mechanism to guarantee that changes in a package's intra-package dependencies will be reflected in the lists.
 * It shouldn't be that hard to write a script to generate the correct lists at build time, though, and hopefully it
 * wouldn't add a ton of time to the build. (It'd be a lot of file IO reading all of the `package.json` files, but
 * computers are also fast. We'd have to experiement.)
 *
 * @param watchPackages The packages to watch. Shouldn't include any transitive dependencies, even if they're also
 * direct dependencies. (In other words, if A depends on B and C, and B depends on C, then A should only list B, not C.)
 *
 * @returns A plugin which will add the given packages to a build's watch list if the build is running in watch mode.
 */
export function makeWatchDependenciesPlugin(watchPackages) {
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
