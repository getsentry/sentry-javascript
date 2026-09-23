/**
 * Replace plugin docs: https://rolldown.rs/builtin-plugins/replace#replace-plugin
 */

import { builtinModules } from 'node:module';
import { replacePlugin } from 'rolldown/plugins';

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
 * @returns A `rolldown` replace plugin instance.
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

// Markers use the `/*! ... */` legal-comment syntax so rolldown's transpile preserves them.
// We run as a `transform` (per-module) hook rather than `renderChunk`: the block typically uses
// imports declared at the module top, and stripping it before the module graph is analysed lets
// those now-unused imports be tree-shaken away.
const REMOVE_DEV_BLOCK =
  /\/\*! rollup-include-development-only \*\/[\s\S]*?\/\*! rollup-include-development-only-end \*\/\s*/g;

export function makeProductionReplacePlugin() {
  return {
    name: 'remove-dev-mode-blocks',
    transform(code) {
      if (!code.includes('rollup-include-development-only')) return null;
      return { code: code.replace(REMOVE_DEV_BLOCK, ''), map: null };
    },
  };
}

const REMOVE_CJS_BLOCK = /\/\*! rollup-include-cjs-only \*\/[\s\S]*?\/\*! rollup-include-cjs-only-end \*\/\s*/g;
const REMOVE_ESM_BLOCK = /\/\*! rollup-include-esm-only \*\/[\s\S]*?\/\*! rollup-include-esm-only-end \*\/\s*/g;
const STRIP_CJS_MARKERS = /[ \t]*\/\*! rollup-include-cjs-only(?:-end)? \*\/[ \t]*\r?\n?/g;
const STRIP_ESM_MARKERS = /[ \t]*\/\*! rollup-include-esm-only(?:-end)? \*\/[ \t]*\r?\n?/g;

export function makeEsmCjsReplacePlugin(type) {
  const removeBlock = type === 'esm' ? REMOVE_CJS_BLOCK : REMOVE_ESM_BLOCK;
  const stripMarkers = type === 'esm' ? STRIP_ESM_MARKERS : STRIP_CJS_MARKERS;

  return {
    name: 'remove-esm-cjs-mode-blocks',
    transform(code) {
      if (!code.includes('rollup-include-')) return null;
      return { code: code.replace(removeBlock, '').replace(stripMarkers, ''), map: null };
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

// For packages that bundle CommonJS dependencies. Rolldown converts CommonJS natively, but not the
// vendored graph's `require()` of node builtins: those survive into the ESM build as rolldown's
// `__require` helper, which throws in every ESM runtime (plain Node ESM included, since `require` is
// not defined there).
//
// Neither knob rolldown offers fixes it. `platform: 'node'` makes `__require` a real
// `createRequire(import.meta.url)`, but that lands a static `node:module` import in the *shared*
// runtime chunk, which every module imports for `__toESM` - including entries that edge runtimes
// pull in (e.g. `@sentry/server-utils` from `@sentry/vercel-edge`), so edge and browser bundlers then fail to resolve `node:`. And
// evaluating `createRequire(import.meta.url)` at module scope crashes with ERR_INVALID_ARG_VALUE
// once a downstream bundler re-bundles our ESM to CJS (see node-integration-tests' `esbuild` suite).
//
// So do what `@rollup/plugin-commonjs` used to: turn each `require('<builtin>')` into a static import.
// `preserveModules` gives every vendored file its own chunk, so the `node:` imports land only in
// the Node-only chunks that actually need them and never in the shared runtime chunk.
export function makeBuiltinRequireShimPlugin() {
  let replaced = false;

  return {
    name: 'builtin-require-shim',
    renderChunk(code, _chunk, outputOptions) {
      // The CJS variant has a real `require`; rolldown never emits the helper there.
      if (outputOptions.format !== 'es' && outputOptions.format !== 'esm') return null;

      const imports = new Map();
      // Built per call: rolldown renders chunks concurrently, and a shared global regex would
      // carry `lastIndex` across those calls and skip matches.
      const rewritten = code.replace(/__require\("([^"]+)"\)/g, (_match, specifier) => {
        const bare = specifier.replace(/^node:/, '');
        if (!builtinModules.includes(bare)) {
          throw new Error(
            `The vendored graph \`require()\`s "${specifier}", which is not a node builtin. This shim only knows how to hoist builtins into static imports - handle that dependency explicitly instead.`,
          );
        }

        const identifier = `__sentryRequire_${bare.replace(/[^a-zA-Z0-9]/g, '_')}`;
        imports.set(identifier, specifier);

        return identifier;
      });

      if (!imports.size) return null;
      replaced = true;

      const preamble = [...imports].map(([identifier, specifier]) => `import ${identifier} from "${specifier}";`);

      return { code: `${preamble.join('\n')}\n${rewritten}` };
    },
    generateBundle(outputOptions) {
      if (outputOptions.format !== 'es' && outputOptions.format !== 'esm') return;

      if (!replaced) {
        throw new Error(
          'Expected rolldown to emit `__require(...)` calls for the vendored graph so they could be hoisted into static imports, but no chunk contained one. Rolldown likely changed how it compiles `require()` of externals - re-check this shim against the emitted chunks.',
        );
      }
      replaced = false;
    },
  };
}

// Always vendor `debug`'s Node build. Its default entry picks browser vs node at require time,
// which drags the browser build into this server-only bundle, and the browser build's storage
// detection probes `localStorage` at import time, which on Node >= 26 emits an ExperimentalWarning
// that pollutes stderr and console breadcrumbs in every user app. `order: 'pre'` so this wins over
// rolldown's own resolution.
export function makeDebugNodeAliasPlugin() {
  return {
    name: 'debug-node-alias',
    resolveId: {
      order: 'pre',
      handler(source, importer) {
        return source === 'debug' ? this.resolve('debug/src/node.js', importer, { skipSelf: true }) : null;
      },
    },
  };
}

// `esquery` publishes a `module` field, so rolldown resolves the CJS `require('esquery')` inside the
// vendored graph to its ESM build and then converts that namespace with `__toCommonJS`, handing the
// caller `{ default: fn }` instead of the function itself - `esquery.parse` ends up undefined and
// every orchestrion injection fails. `@rollup/plugin-commonjs` used to settle this with
// `requireReturnsDefault: 'auto'`. Point the CJS caller at the CJS build instead, which needs no
// interop guesswork at all.
export function makeEsqueryCjsAliasPlugin() {
  return {
    name: 'esquery-cjs-alias',
    resolveId: {
      order: 'pre',
      handler(source, importer) {
        return source === 'esquery' ? this.resolve('esquery/dist/esquery.min.js', importer, { skipSelf: true }) : null;
      },
    },
  };
}
