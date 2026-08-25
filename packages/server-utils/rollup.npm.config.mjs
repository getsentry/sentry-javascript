import { builtinModules } from 'node:module';
import * as nodePath from 'node:path';
import license from 'rollup-plugin-license';
import { defineConfig } from 'rolldown';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// The orchestrion runtime dependency chain (`@apm-js-collab/tracing-hooks` →
// `@apm-js-collab/code-transformer` → meriyah/esquery/astring/…) is bundled into this package's
// build instead of installed as runtime dependencies. Everything in the chain is plain JS, and
// bundling removes two whole classes of downstream breakage:
//
// 1. `require(esm)`: the chain's only sync entry (`hook-sync.mjs`) is ESM-only, so an installed
//    dependency forces our CJS build through Node's `require(esm)` bridge — unavailable on the AWS
//    Lambda runtime (`--no-experimental-require-module`) and broken on `Module.register()` loader
//    threads on Node 22.15–24.12 (`The resolveSync() method is not implemented`). Compiled into our
//    own dual build, the CJS variant is genuine CJS.
// 2. Tracer/runtime exports-map mismatches: meriyah 6.1's `module-sync`-first exports map is
//    resolved differently by build-time tracers (`@vercel/nft`, nf3, Nitro externals) than by the
//    runtime CJS loader, producing pruned server bundles that crash with `MODULE_NOT_FOUND`
//    (https://github.com/vercel/nft/issues/603, https://github.com/nitrojs/nitro/issues/4456).
//    Bundled, there is no runtime package resolution left to get wrong.
//
// `@apm-js-collab/code-transformer-bundler-plugins` (build-time only) is bundled as well so the
// build-time and runtime transforms always ship the same `code-transformer` version, and so this
// package has no `@apm-js-collab/*` install footprint at all.
//
// Rolldown converts CommonJS natively, so the `@rollup/plugin-commonjs` instance this config used
// to carry (and its `transformMixedEsModules` / `requireReturnsDefault` / `strictRequires` tuning)
// is gone. What it does not do is convert the vendored graph's `require()` of node builtins: those
// survive into the ESM build as rolldown's `__require` helper, which throws in every ESM runtime
// (plain Node ESM included, since `require` is not defined there).
//
// Neither knob rolldown offers fixes it. `platform: 'node'` makes `__require` a real
// `createRequire(import.meta.url)`, but that lands a static `node:module` import in the *shared*
// runtime chunk, which every module here imports for `__toESM` - including the entry
// `@sentry/vercel-edge` pulls in, so edge and browser bundlers then fail to resolve `node:`. And
// evaluating `createRequire(import.meta.url)` at module scope crashes with ERR_INVALID_ARG_VALUE
// once a downstream bundler re-bundles our ESM to CJS (see node-integration-tests' `esbuild` suite).
//
// So do what the commonjs plugin used to: turn each `require('<builtin>')` into a static import.
// `preserveModules` gives every vendored file its own chunk, so the `node:` imports land only in
// the Node-only chunks that actually need them and never in the shared runtime chunk.
function makeBuiltinRequireShim() {
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
const debugNodeAlias = {
  name: 'debug-node-alias',
  resolveId: {
    order: 'pre',
    handler(source, importer) {
      return source === 'debug' ? this.resolve('debug/src/node.js', importer, { skipSelf: true }) : null;
    },
  },
};

// `esquery` publishes a `module` field, so rolldown resolves the CJS `require('esquery')` inside the
// vendored graph to its ESM build and then converts that namespace with `__toCommonJS`, handing the
// caller `{ default: fn }` instead of the function itself - `esquery.parse` ends up undefined and
// every orchestrion injection fails. `@rollup/plugin-commonjs` used to settle this with
// `requireReturnsDefault: 'auto'`. Point the CJS caller at the CJS build instead, which needs no
// interop guesswork at all.
const esqueryCjsAlias = {
  name: 'esquery-cjs-alias',
  resolveId: {
    order: 'pre',
    handler(source, importer) {
      return source === 'esquery' ? this.resolve('esquery/dist/esquery.min.js', importer, { skipSelf: true }) : null;
    },
  },
};

// Bundling files from the repo-root `node_modules` moves the common source ancestor up to the repo
// root, so `preserveModules` names our own files `packages/server-utils/src/...` — strip that
// prefix to keep the `build/cjs/index.js` layout the `exports` map points at. And npm never packs
// `node_modules` directories, so the vendored dependencies must not be emitted under that name.
const sanitizedFileNames = info =>
  `${info.name.replace(/^packages\/server-utils\/src\//, '').replace(/node_modules/g, 'vendored')}.js`;

// The vendored dependencies (see above) are third-party code redistributed inside this package's
// published `build/`, so their licenses require us to carry each one's copyright/permission notice
// (and, for Apache-2.0 deps like `@apm-js-collab/*`, the upstream NOTICE). Rollup strips per-file
// banners, so instead we aggregate them into a single `build/THIRD-PARTY-LICENSES.txt`. The default
// template emits each dependency's license text AND its NOTICE text, which covers the MIT/ISC/BSD
// notice requirement and the Apache-2.0 §4(d) NOTICE requirement. Only bundled (non-external)
// packages are collected — our own `@sentry/*` deps stay external and are excluded. The plugin only
// uses hooks rolldown implements (`renderChunk` / `generateBundle` plus `this.getModuleIds()`), so
// it keeps working unchanged on rolldown.
//
// Both the CJS and ESM build variants run this and bundle the same dependency set, so each writes
// the same file; the last write wins and the content is identical.
const thirdPartyLicensePlugin = license({
  thirdParty: {
    includePrivate: false,
    output: {
      file: 'build/THIRD-PARTY-LICENSES.txt',
    },
  },
});

// Rolldown compiles each bundled CJS dependency into `var require_x = __commonJSMin(...)` and has
// consumers pull it in with `import { require_x } from './body.js'`. That named import is used, so
// nothing downstream can drop it - which dragged the whole build-time-only transformer chain
// (meriyah, astring, source-map: ~185 kB) into every consumer's runtime bundle.
//
// `@rollup/plugin-commonjs` split each CJS module in two: a tiny `_virtual` module holding the
// exports, and the body imported purely for its side effects. With this package's
// `sideEffects: false`, a downstream bundler is then free to drop the body. Reproduce that split so
// the emitted graph matches what rollup produced.
//
// The exports live in a mutable container rather than being merged into an object, because a CJS
// module's exports can be any value (esquery's is a function).
const CJS_INIT = /^var (require_[A-Za-z0-9_$]+) = \/\* @__PURE__ \*\/ __commonJSMin\(/m;

// Only the parse/query/generate/sourcemap libraries are split. They are reached exclusively through
// the lazily-invoked `code-transformer` factory, which `register.ts` calls inside a try/catch, so a
// consumer that drops them degrades to "no channel injection" instead of throwing. Everything else
// (notably `debug`, whose export is called at module-evaluation time) must stay non-droppable.
const SPLITTABLE = /vendored\/(meriyah|astring|source-map|esquery)\//;

function makeCjsExportsSplitPlugin() {
  return {
    name: 'cjs-exports-split',
    generateBundle(outputOptions, bundle) {
      if (outputOptions.format !== 'es' && outputOptions.format !== 'esm') return;

      const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
      const split = new Map();

      // Pass 1: every chunk that defines and exports a single CJS initializer gets a container.
      for (const chunk of chunks) {
        if (!SPLITTABLE.test(chunk.fileName)) continue;
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
        body.code =
          `import { __cjs as ${name}__cjs } from "${relative(body.fileName, container)}";\n` +
          body.code.replace(`export { ${name} };`, `${name}__cjs.v = ${name}();`);
      }

      // Pass 2: consumers import the body for side effects only and read the container.
      for (const chunk of chunks) {
        for (const [name, { body, container }] of split) {
          if (chunk === body) continue;
          const importRe = new RegExp(`^import \\{ ${name} \\} from "([^"]+)";$`, 'm');
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

const orchestrionRuntimeHooks = [
  // EXPERIMENTAL — orchestrion.js runtime hook. A hand-written `.mjs` shim that SDKs reference via
  // a `--import .../orchestrion/import-hook` flag. We pass it through rollup only to copy it into
  // `build/orchestrion/` at the path the package.json `exports` map expects; `external: /.*/` keeps
  // every import (e.g. `@sentry/server-utils/orchestrion/config`) as a runtime resolution against
  // the installed package.
  defineConfig({
    input: 'src/orchestrion/runtime/import-hook.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/orchestrion/import-hook.mjs' },
  }),
];

export default [
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/config/index.ts` and the `src/orchestrion/bundler/*.ts`
      // plugins are loaded via dedicated subpath exports (`.../orchestrion/config`,
      // `.../orchestrion/vite`, etc.) — none are reachable from `src/index.ts`, so
      // we list them as separate entrypoints to guarantee they end up in build/esm
      // and build/cjs.
      entrypoints: [
        'src/index.ts',
        'src/index.no-diagnostic-channels.ts',
        'src/orchestrion/config/index.ts',
        // `src/orchestrion/runtime/register.ts` backs the `./orchestrion/register`
        // subpath export; the Node SDK `require`s it synchronously from
        // `Sentry.init()` to install the channel-injection hooks.
        'src/orchestrion/runtime/register.ts',
        // The async module hooks passed to `Module.register()`. They load on Node's ESM loader
        // thread, which cannot resolve bare specifiers into our bundled dependency graph — but
        // relative imports of on-disk files work, and `build/esm` is a `"type": "module"` scope, so
        // this entrypoint shares the vendored chunks with the rest of the build. The `./orchestrion/
        // hook` export only maps its `import` condition (nothing ever `require()`s it), so the copy
        // in `build/cjs` is unused.
        'src/orchestrion/runtime/hook.mjs',
        'src/orchestrion/bundler/vite.ts',
        'src/orchestrion/bundler/rollup.ts',
        'src/orchestrion/bundler/webpack.ts',
        'src/orchestrion/bundler/webpack-loader.ts',
        'src/orchestrion/bundler/esbuild.ts',
      ],
      packageSpecificConfig: {
        plugins: [
          debugNodeAlias,
          esqueryCjsAlias,
          thirdPartyLicensePlugin,
          makeBuiltinRequireShim(),
          makeCjsExportsSplitPlugin(),
        ],
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to true because we don't want to bundle everything into one file.
          preserveModules: true,
          entryFileNames: sanitizedFileNames,
          // The vendored dependencies import builtins unprefixed (`import … from 'tty'`), which
          // Deno rejects outright and vite-node (Node 26) misresolves as a relative path. Emit them
          // `node:`-prefixed.
          paths: Object.fromEntries(builtinModules.map(m => [m, `node:${m}`])),
        },
      },
    }),
  ),
];
