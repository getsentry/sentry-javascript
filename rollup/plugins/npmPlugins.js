/**
 * Regex Replace plugin docs: https://github.com/jetiny/rollup-plugin-re
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 * Sucrase plugin docs: https://github.com/rollup/plugins/tree/master/packages/sucrase
 */

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
    [hookName]: (..._args) => {
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

export { makeExtractPolyfillsPlugin } from './extractPolyfillsPlugin.js';
