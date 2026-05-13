/**
 * Rollup plugin hooks docs: https://rollupjs.org/guide/en/#build-hooks and
 * https://rollupjs.org/guide/en/#output-generation-hooks
 *
 * esbuild plugin docs: https://github.com/egoist/rollup-plugin-esbuild
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 */

import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import esbuild from 'rollup-plugin-esbuild';

/**
 * Create a plugin to transpile TS/JSX syntax using `esbuild`.
 *
 * `target: 'es2020'` keeps ES2020-native syntax (`?.`, `??`, optional catch binding) and
 * downlevels everything newer (logical assignment, numeric separators, class private
 * fields, static class blocks, ...).
 *
 * `esbuildOptions` are forwarded to `rollup-plugin-esbuild` verbatim and can override
 * any of the pinned defaults (e.g. JSX-related keys like `jsxFactory` / `jsxFragment`
 * for packages that use a non-React pragma).
 */
export function makeEsbuildPlugin(esbuildOptions = {}) {
  const plugin = esbuild({
    // `.json` is handled by the JSON plugin further down the pipeline.
    exclude: ['**/*.json'],
    // ES2020 is our floor — keeps `?.`/`??` native, downlevels everything newer.
    target: 'es2020',
    // Don't read per-package tsconfig (they vary and can pull in unrelated settings).
    // Pin only the compilerOptions that affect codegen.
    tsconfig: false,
    tsconfigRaw: {
      compilerOptions: {
        // Match the project tsconfig's effective behavior at target=es2020: class
        // field initializers compile to `this.x = v` (set semantics), not via the
        // `Object.defineProperty`-based `__publicField` helper esbuild emits by
        // default. This is what tsc itself outputs at this target.
        useDefineForClassFields: false,
      },
    },
    sourceMap: true,
    ...esbuildOptions,
  });

  // Force a stable plugin name so the plugin sort order in utils.mjs can target it.
  plugin.name = 'esbuild';
  return plugin;
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

export function makeProductionReplacePlugin() {
  const pattern = /\/\* rollup-include-development-only \*\/[\s\S]*?\/\* rollup-include-development-only-end \*\/\s*/g;

  // Must run as a `transform` (per-module) hook rather than `renderChunk`: esbuild
  // strips arbitrary block comments during transpile, so by the time `renderChunk`
  // would fire, the `rollup-include-development-only` marker comments are gone.
  // The plugin sort order in utils.mjs pins this before `esbuild`.
  return {
    name: 'remove-dev-mode-blocks',
    transform(code) {
      if (!code.includes('rollup-include-development-only')) return null;
      return { code: code.replace(pattern, ''), map: null };
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

  return replace({
    preventAssignment: true,
    values,
  });
}
