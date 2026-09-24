/**
 * Replace plugin docs: https://rolldown.rs/builtin-plugins/replace#replace-plugin
 */

import { builtinModules } from 'node:module';
import * as nodePath from 'node:path';
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

// Rolldown compiles each bundled CJS dependency into `var require_x = __commonJSMin(...)` and has
// consumers pull it in with `import { require_x } from './body.js'`. That named import is used, so
// nothing downstream can drop it - which dragged the whole build-time-only transformer chain
// (meriyah, astring, source-map: ~185 kB) into every consumer's runtime bundle.
//
// `@rollup/plugin-commonjs` split each CJS module in two: a tiny `_virtual` module holding the
// exports, and the body imported purely for its side effects. With the package's
// `sideEffects: false`, a downstream bundler is then free to drop the body. Reproduce that split so
// the emitted graph matches what rollup produced.
//
// The exports live in a mutable container rather than being merged into an object, because a CJS
// module's exports can be any value (esquery's is a function).
const CJS_INIT = /^var (require_[A-Za-z0-9_$]+) = \/\* @__PURE__ \*\/ __commonJSMin\(/m;

/**
 * @param splittable Matches the output file names of the CJS modules to split. Only modules whose loss a consumer can
 * survive belong here, because a downstream bundler may drop their bodies.
 */
export function makeCjsExportsSplitPlugin(splittable) {
  return {
    name: 'cjs-exports-split',
    generateBundle(outputOptions, bundle) {
      if (outputOptions.format !== 'es' && outputOptions.format !== 'esm') return;

      const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
      const split = new Map();

      // Pass 1: every chunk that defines and exports a single CJS initializer gets a container.
      for (const chunk of chunks) {
        if (!splittable.test(chunk.fileName)) continue;
        const match = CJS_INIT.exec(chunk.code);
        if (!match) continue;
        const name = match[1];
        if (!chunk.code.includes(`export { ${name} };`)) continue;
        split.set(name, { body: chunk, container: `_virtual/_cjs/${name}.js` });
      }
      if (!split.size) return;

      const relative = (fromFile, toFile) => {
        const rel = nodePath.posix.relative(nodePath.posix.dirname(fromFile), toFile);
        return rel.startsWith('.') ? rel : `./${rel}`;
      };

      for (const [name, { body, container }] of split) {
        this.emitFile({ type: 'asset', fileName: container, source: 'var c = {};\nexport { c as __cjs };\n' });

        // The body stops exporting the initializer and instead runs it into the container. Eager,
        // like `@rollup/plugin-commonjs` with `strictRequires: false`, which this graph already
        // relied on.
        const bodyImport = `import { __cjs as ${name}__cjs } from "${relative(body.fileName, container)}";`;
        const bodyCode = body.code.replace(`export { ${name} };`, `${name}__cjs.v = ${name}();`);
        body.code = `${bodyImport}\n${bodyCode}`;
      }

      // Pass 2: consumers import the body for side effects only and read the container.
      for (const chunk of chunks) {
        for (const [name, { body, container }] of split) {
          if (chunk === body) continue;
          const importRe = new RegExp(`^import \\{ ${name.replaceAll('$', '\\$')} \\} from "([^"]+)";$`, 'm');
          const found = importRe.exec(chunk.code);
          if (!found) continue;
          chunk.code = chunk.code
            .replace(
              found[0],
              `import "${found[1]}";\nimport { __cjs as ${name}__cjs } from "${relative(chunk.fileName, container)}";`,
            )
            // `?? {}` mirrors rollup's `_virtual` module, which held a plain `{}`. If a consumer
            // drops the body, reads yield `undefined` rather than throwing on destructuring, so
            // injection degrades to a caught warning exactly as it does on the rollup build.
            .replaceAll(`${name}()`, `(${name}__cjs.v ?? {})`);
        }
      }
    },
  };
}
