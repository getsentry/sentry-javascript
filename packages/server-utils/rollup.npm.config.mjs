import { builtinModules } from 'node:module';
import commonjs from '@rollup/plugin-commonjs';
import license from 'rollup-plugin-license';
import { defineConfig } from 'rollup';
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
// `requireReturnsDefault: 'auto'`: node-resolve prefers a dependency's ESM build even for CJS
// `require()`s inside the vendored graph. Default-export-only ESM (e.g. esquery) must then resolve
// to the default itself, not a `{ default }` namespace — CJS callers use it as
// `require('esquery').parse(...)`.
//
// `strictRequires: false`: the default `'auto'` wraps conditionally-required modules (e.g.
// `debug`'s browser/node split) in lazy initializers exported as `__require` — an export name that
// downstream re-bundlers mishandle (Turbopack renames it, producing `.require is not a function`
// crashes in Next.js on Cloudflare). Hoisting is safe here: the vendored graph is closed (nothing
// optional/missing) and has no require cycles that depend on lazy evaluation.
const commonJSOptions = { transformMixedEsModules: true, requireReturnsDefault: 'auto', strictRequires: false };
const commonJSPlugin = commonjs(commonJSOptions);

// Always vendor `debug`'s Node build. Its default entry picks browser vs node at require time,
// which drags the browser build into this server-only bundle — and, hoisted by
// `strictRequires: false`, the browser build's storage detection probes `localStorage` at import
// time, which on Node >= 26 emits an ExperimentalWarning that pollutes stderr and console
// breadcrumbs in every user app. `order: 'pre'` because the base config's node-resolve plugin
// sorts ahead of package-specific plugins and would otherwise resolve `debug` first.
const debugNodeAlias = {
  name: 'debug-node-alias',
  resolveId: {
    order: 'pre',
    handler(source, importer) {
      return source === 'debug' ? this.resolve('debug/src/node.js', importer, { skipSelf: true }) : null;
    },
  },
};

// Bundling files from the repo-root `node_modules` moves rollup's common source ancestor up to the
// repo root, so `preserveModules` names our own files `packages/server-utils/src/...` — strip that
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
// packages are collected — our own `@sentry/*` deps stay external and are excluded.
//
// This single instance is shared across BOTH the main (`preserveModules`) config and the runtime
// (`register`/`hook`) config below: `rollup-plugin-license` accumulates scanned dependencies into
// one Map across every build it runs in, so whichever build writes last emits the union of both
// configs' bundled deps — a complete list, even though the two configs bundle different subsets.
const thirdPartyLicensePlugin = license({
  thirdParty: {
    includePrivate: false,
    output: {
      file: 'build/THIRD-PARTY-LICENSES.txt',
    },
  },
});

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

// `interop`/`paths` overrides shared by both configs' outputs (see the main config's inline notes):
// builtins need `'default'` interop and `node:`-prefixed specifiers because the commonjs-converted
// vendored dependencies import them as unprefixed default imports.
const vendorInterop = id => (id && (id.startsWith('node:') || builtinModules.includes(id)) ? 'default' : 'esModule');
const vendorPaths = Object.fromEntries(builtinModules.map(m => [m, `node:${m}`]));

// The two runtime entrypoints backing the `./orchestrion/register` and `./orchestrion/hook` subpath
// exports are the only ones that pull in the orchestrion transformer chain
// (`@apm-js-collab/code-transformer` → meriyah/esquery/astring/source-map). Under `preserveModules`,
// `@rollup/plugin-commonjs` emits those CJS deps as an empty proxy object (`var meriyah = {}`)
// populated by a *separate* module through cross-module property writes (`meriyah.parse = parse`)
// reachable only via a bare side-effect import. Downstream re-bundlers (Next.js server, serverless,
// nitro/vite — rollup and rolldown alike) tree-shake those "unused" writes away, leaving the proxy
// empty so `parse`/`generate`/the SourceMap constructors are `undefined` at runtime and every
// instrumented module crashes when loaded (https://github.com/getsentry/sentry-javascript/issues/23664).
//
// So these two entrypoints are built WITHOUT `preserveModules`: the transformer chain lands in one
// self-contained shared chunk where each dep's proxy object, its population, and its consumer are
// co-located in a single module. Rollup never separates a property write from a read within one
// module, so the chain survives downstream tree-shaking even under this package's `sideEffects:false`.
// The rest of the package keeps `preserveModules` (below) for fine-grained consumer tree-shaking.
const orchestrionRuntimeEntrypoints = makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      // Keyed inputs so the entry chunks land at the exact paths the `exports` map points at, even
      // without `preserveModules`.
      input: {
        'orchestrion/runtime/register': 'src/orchestrion/runtime/register.ts',
        'orchestrion/runtime/hook': 'src/orchestrion/runtime/hook.mjs',
      },
      plugins: [debugNodeAlias, commonJSPlugin, thirdPartyLicensePlugin],
      output: {
        exports: 'named',
        preserveModules: false,
        entryFileNames: '[name].js',
        // The shared transformer chunk sits beside its two entrypoints.
        chunkFileNames: 'orchestrion/runtime/vendored-[hash].js',
        interop: vendorInterop,
        paths: vendorPaths,
      },
    },
  }),
);

export default [
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/config/index.ts` and the `src/orchestrion/bundler/*.ts`
      // plugins are loaded via dedicated subpath exports (`.../orchestrion/config`,
      // `.../orchestrion/vite`, etc.) — none are reachable from `src/index.ts`, so
      // we list them as separate entrypoints to guarantee they end up in build/esm
      // and build/cjs.
      // `src/orchestrion/runtime/register.ts` (the `./orchestrion/register` subpath the Node SDK
      // `require`s from `Sentry.init()`) and `src/orchestrion/runtime/hook.mjs` (the async
      // `Module.register()` hooks) are built by the separate `orchestrionRuntimeEntrypoints` config
      // above, without `preserveModules` — see the note there.
      entrypoints: [
        'src/index.ts',
        'src/index.no-diagnostic-channels.ts',
        'src/orchestrion/config/index.ts',
        'src/orchestrion/bundler/vite.ts',
        'src/orchestrion/bundler/rollup.ts',
        'src/orchestrion/bundler/webpack.ts',
        'src/orchestrion/bundler/webpack-loader.ts',
        'src/orchestrion/bundler/esbuild.ts',
      ],
      packageSpecificConfig: {
        plugins: [debugNodeAlias, commonJSPlugin, thirdPartyLicensePlugin],
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to true because we don't want to bundle everything into one file.
          preserveModules: true,
          entryFileNames: sanitizedFileNames,
          // The repo default `interop: 'esModule'` dereferences `.default` on default imports of
          // externals. The commonjs-converted vendored dependencies import Node builtins that way
          // (e.g. `require('path')` → default import of `path`), and builtins have no `.default` in
          // CJS — so builtins need `'default'` interop (the module itself is the default export). The
          // vendored deps also import builtins unprefixed (`import … from 'tty'`), which Deno rejects
          // and vite-node (Node 26) misresolves as a relative path, so `paths` emits them
          // `node:`-prefixed. Both are shared with the runtime config above.
          interop: vendorInterop,
          paths: vendorPaths,
        },
      },
    }),
  ),
  // Built last so its shared `thirdPartyLicensePlugin` instance writes the complete, accumulated
  // license list (see the plugin definition above).
  ...orchestrionRuntimeEntrypoints,
];
