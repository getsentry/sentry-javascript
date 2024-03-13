/**
 * Rollup plugin hooks docs: https://rollupjs.org/guide/en/#build-hooks and
 * https://rollupjs.org/guide/en/#output-generation-hooks
 *
 * Cleanup plugin docs: https://github.com/aMarCruz/rollup-plugin-cleanup
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 * Sucrase plugin docs: https://github.com/rollup/plugins/tree/master/packages/sucrase
 */

import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import sucrase from '@rollup/plugin-sucrase';
import cleanup from 'rollup-plugin-cleanup';

/**
 * Create a plugin to transpile TS syntax using `sucrase`.
 *
 * @returns An instance of the `@rollup/plugin-sucrase` plugin
 */
export function makeSucrasePlugin(options = {}) {
  return sucrase({
    // Required for bundling OTEL code properly
    exclude: ['**/*.json'],
    transforms: ['typescript', 'jsx'],
    ...options,
  });
}

export function makeJsonPlugin() {
  return json();
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
    // eslint-disable-next-line no-unused-vars
    [hookName]: (..._args) => {
      // eslint-disable-next-line no-debugger
      debugger;
      return null;
    },
  };
}

/**
 * Create a plugin to clean up output files by:
 * - Converting line endings unix line endings
 * - Removing consecutive empty lines
 *
 * @returns A `rollup-plugin-cleanup` instance.
 */
export function makeCleanupPlugin() {
  return cleanup({
    // line endings are unix-ized by default
    comments: 'all', // comments to keep
    compactComments: 'false', // don't remove blank lines in multi-line comments
    maxEmptyLines: 1,
    extensions: ['js', 'jsx', 'ts', 'tsx'],
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

/**
 * Creates a plugin to replace build flags of rrweb with either a constant (if passed true/false) or with a safe statement that:
 * a) evaluates to `true`
 * b) can easily be modified by our users' bundlers to evaluate to false, facilitating the treeshaking of logger code.
 *
 * When `undefined` is passed,
 * end users can define e.g. `__RRWEB_EXCLUDE_SHADOW_DOM__` in their bundler to shake out shadow dom specific rrweb code.
 */
export function makeRrwebBuildPlugin({ excludeShadowDom, excludeIframe } = {}) {
  const values = {};

  if (typeof excludeShadowDom === 'boolean') {
    values['__RRWEB_EXCLUDE_SHADOW_DOM__'] = excludeShadowDom;
  }

  if (typeof excludeIframe === 'boolean') {
    values['__RRWEB_EXCLUDE_IFRAME__'] = excludeIframe;
  }

  return replace({
    preventAssignment: true,
    values,
  });
}

export { makeExtractPolyfillsPlugin } from './extractPolyfillsPlugin.mjs';
