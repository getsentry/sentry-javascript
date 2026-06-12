/**
 * Rollup plugin hooks docs: https://rollupjs.org/guide/en/#build-hooks and
 * https://rollupjs.org/guide/en/#output-generation-hooks
 *
 * esbuild plugin docs: https://github.com/egoist/rollup-plugin-esbuild
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 */

import fs from 'node:fs';
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
 * With `preserveModules: true`, Rollup emits bundled dependencies that resolve from `node_modules`
 * (e.g. a vendored devDependency like `@sentry/conventions`) into an output directory literally
 * named `node_modules`. That breaks at runtime: Node treats `node_modules` as a package-scope
 * boundary, so the `{"type":"module"}` marker we emit at the ESM build root does NOT apply inside it.
 * Node then loads our ESM `.js` files there as CommonJS — named imports fail with
 * "is a CommonJS module" — and Vitest externalizes any `/node_modules/` path and `require()`s it,
 * which additionally fails on Node 18 (no `require(esm)` support).
 *
 * This plugin relocates those modules to a plain `_external/` directory (still inside `src` so
 * `preserveModules` roots them under the build root). Rollup rewrites every import specifier to the
 * new location automatically, so the scope marker applies and the heuristics no longer fire.
 */
export function makeRelocateVendoredModulesPlugin() {
  // Rollup module ids and `@rollup/plugin-node-resolve` results use OS-native separators, i.e.
  // backslashes on Windows. Normalize every path we inspect to forward slashes before matching,
  // otherwise `/node_modules/` never matches on Windows and the relocation silently no-ops.
  const toPosix = p => p.split('\\').join('/');
  const cwd = toPosix(process.cwd());
  const NODE_MODULES = '/node_modules/';
  const VENDOR_DIR = `${cwd}/src/_external/`;

  return {
    name: 'relocate-vendored-modules',
    async resolveId(source, importer, options) {
      // Ids we've already relocated resolve to themselves.
      if (toPosix(source).startsWith(VENDOR_DIR)) return source;

      // When the importer is itself a relocated module, resolve its imports (which are often
      // relative, e.g. `./chunk.js`) against the REAL on-disk location so sibling files inside the
      // vendored package are found — then relocate those too, preserving the package's structure.
      const realImporter =
        importer && toPosix(importer).startsWith(VENDOR_DIR)
          ? this.getModuleInfo(importer)?.meta?.vendoredFrom
          : importer;

      const resolved = await this.resolve(source, realImporter, { ...options, skipSelf: true });
      // Leave external deps and unresolved ids untouched.
      if (!resolved || resolved.external) return resolved;

      const resolvedId = toPosix(resolved.id);
      const idx = resolvedId.lastIndexOf(NODE_MODULES);
      if (idx === -1) return resolved;

      // Map `<anywhere>/node_modules/<pkg>/<...>` -> `<cwd>/src/_external/<pkg>/<...>` and remember
      // the real on-disk path so `load()` can read the original source.
      const rest = resolvedId.slice(idx + NODE_MODULES.length);
      return { id: `${VENDOR_DIR}${rest}`, meta: { vendoredFrom: resolved.id } };
    },
    load(id) {
      if (!toPosix(id).startsWith(VENDOR_DIR)) return null;
      const vendoredFrom = this.getModuleInfo(id)?.meta?.vendoredFrom;
      return vendoredFrom ? fs.readFileSync(vendoredFrom, 'utf-8') : null;
    },
  };
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
  const plugin = replace({
    preventAssignment: false,
    values: {
      __DEBUG_BUILD__: "(typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__)",
    },
  });
  plugin.name = 'replace-debug-build-statement';
  return plugin;
}

export function makeProductionReplacePlugin() {
  // Markers use the `/*! ... */` legal-comment syntax so esbuild preserves them through
  // transpile. We still run as a `transform` (per-module) hook rather than `renderChunk`:
  // the block typically uses imports declared at the module top, and stripping it before
  // rollup analyses module-graph imports lets those now-unused imports be tree-shaken away.
  // The plugin sort order in utils.mjs pins this before `esbuild`.
  const pattern =
    /\/\*! rollup-include-development-only \*\/[\s\S]*?\/\*! rollup-include-development-only-end \*\/\s*/g;

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

  const plugin = replace({
    preventAssignment: true,
    values,
  });
  plugin.name = 'replace-rrweb-build-flags';
  return plugin;
}
