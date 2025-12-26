/**
 * Replace plugin docs: https://rolldown.rs/builtin-plugins/replace#replace-plugin
 */

import { replacePlugin } from 'rolldown/plugins';

export { makeMoveDtsPlugin } from './move-dts-plugin.mjs';

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
 * Creates a plugin to replace all instances of "__DEBUG_BUILD__" with a safe statement that
 * a) evaluates to `true`
 * b) can easily be modified by our users' bundlers to evaluate to false, facilitating the treeshaking of logger code.
 *
 * @returns A `rolldown.replacePlugin` instance.
 */
export function makeDebugBuildStatementReplacePlugin() {
  return replacePlugin(
    {
      __DEBUG_BUILD__: "(typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__)",
    },
    {
      preventAssignment: true,
    },
  );
}

export function makeProductionReplacePlugin() {
  // Use legal comments (/*!) so they're preserved by Rolldown
  // NOTE: Due to a Rolldown limitation, the ending comment must be placed before a statement
  // (e.g., before a return) rather than after a block, otherwise it gets stripped.
  // See: https://github.com/rolldown/rolldown/issues/[TODO: file issue]
  const pattern =
    /\/\*! rollup-include-development-only \*\/[\s\S]*?\/\*! rollup-include-development-only-end \*\/\s*/g;

  function stripDevBlocks(code) {
    if (!code) return null;
    if (!code.includes('rollup-include-development-only')) return null;

    const replaced = code.replace(pattern, '');

    return { code: replaced, map: null };
  }

  return {
    name: 'remove-dev-mode-blocks',
    renderChunk(code) {
      return stripDevBlocks(code);
    },
  };
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

  return replacePlugin(values, {
    preventAssignment: true,
  });
}
