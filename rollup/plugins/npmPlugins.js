/**
 * Rollup plugin hooks docs: https://rollupjs.org/guide/en/#build-hooks and
 * https://rollupjs.org/guide/en/#output-generation-hooks
 *
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
 * Hooks can be found at https://rollupjs.org/guide/en/#build-hooks and
 * https://rollupjs.org/guide/en/#output-generation-hooks.
 *
 * @param hookName The name of the hook at which to pause.
 * @returns A plugin which inserts a debugger statement in the phase represented by the given hook
 *
 * For convenience, here are pre-built debuggers for every hook:
 *
 *  makeDebuggerPlugin('buildStart'),
 *  makeDebuggerPlugin('options'),
 *  makeDebuggerPlugin('resolveId'),
 *  makeDebuggerPlugin('resolveDynamicImport'),
 *  makeDebuggerPlugin('load'),
 *  makeDebuggerPlugin('transform'),
 *  makeDebuggerPlugin('shouldTransformCachedModule'),
 *  makeDebuggerPlugin('moduleParsed'),
 *  makeDebuggerPlugin('buildEnd'),
 *  makeDebuggerPlugin('watchChange'),
 *  makeDebuggerPlugin('closeWatcher'),
 *  makeDebuggerPlugin('outputOptions'),
 *  makeDebuggerPlugin('renderStart'),
 *  makeDebuggerPlugin('banner'),
 *  makeDebuggerPlugin('footer'),
 *  makeDebuggerPlugin('intro'),
 *  makeDebuggerPlugin('outro'),
 *  makeDebuggerPlugin('augmentChunkHash'),
 *  makeDebuggerPlugin('renderDynamicImport'),
 *  makeDebuggerPlugin('resolveFileUrl'),
 *  makeDebuggerPlugin('resolveImportMeta'),
 *  makeDebuggerPlugin('renderChunk'),
 *  makeDebuggerPlugin('renderError'),
 *  makeDebuggerPlugin('generateBundle'),
 *  makeDebuggerPlugin('writeBundle'),
 *  makeDebuggerPlugin('closeBundle'),
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
        test: /\/[/*] eslint-.*\n/g,
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
 * Create a plugin to strip multi-line comments from the output.
 *
 * @returns A `rollup-plugin-re` instance.
 */
export function makeRemoveMultiLineCommentsPlugin() {
  return regexReplace({
    patterns: [
      {
        // If we ever want to remove all comments instead of just /* ... */ ones, the regex is
        // /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm. We also might consider a plugin like
        // https://github.com/aMarCruz/rollup-plugin-cleanup (though to remove only multi-line comments we'd end up with
        // a regex there, too).
        test: /\/\*[\s\S]*?\*\//gm,
        replace: '',
      },
    ],
  });
}

/**
 * Creates a plugin to replace all instances of "__DEBUG_BUILD__" with a safe statement that
 * a) evaluates to `true`
 * b) can easily be modified by our users' bundlers to evaluate to false, facilitating the treeshaking of logger code.
 *
 * @returns A `@rollup/plugin-replace` instance.
 */
export function makeDebugBuildStatementReplacePlugin() {
  return replace({
    preventAssignment: false,
    values: {
      __DEBUG_BUILD__: "(typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__)",
    },
  });
}

export { makeExtractPolyfillsPlugin } from './extractPolyfillsPlugin.js';
