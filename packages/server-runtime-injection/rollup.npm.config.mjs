import { builtinModules } from 'node:module';
import * as path from 'node:path';
import license from 'rollup-plugin-license';
import { defineConfig } from 'rolldown';
import { makeBaseNPMConfig, makeNPMConfigVariants, plugins } from '@sentry-internal/rollup-utils';

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
// `@sentry/*` deps (including `@sentry/server-utils`, from which `register.ts` imports
// `SENTRY_INSTRUMENTATIONS`) stay external — the base config keeps them out of the bundle, so they
// resolve from `node_modules` at runtime.
//
// Replace `debug` with `src/debug.ts`, which logs through the Sentry logger. `debug` and the
// `supports-color` it loads read `process.env` at import time, which throws on Deno without env
// permission. `order: 'pre'` so it resolves `debug` before the base config's resolution does.
// The vendored callers `require('debug')`, and rolldown hands a `require()` of an ES module its
// namespace (`{ default }`), so a CJS module in between re-exports the default as `module.exports`.
const DEBUG_SHIM_ID = '\0debug-shim';
const debugShim = {
  name: 'debug-shim',
  resolveId: {
    order: 'pre',
    handler(source) {
      return source === 'debug' ? DEBUG_SHIM_ID : null;
    },
  },
  load(id) {
    return id === DEBUG_SHIM_ID
      ? `module.exports = require(${JSON.stringify(path.join(import.meta.dirname, 'src/debug.ts'))}).default;`
      : null;
  },
};

// `ModulePatch` reads `process.env.TRACING_DUMP` after each module it transforms. On Deno without
// env permission that read throws, and the module counts as failed. Treat the throw as unset.
const guardTracingDump = {
  name: 'guard-tracing-dump',
  transform(code, id) {
    if (!id.includes('@apm-js-collab/tracing-hooks/index.js')) {
      return null;
    }
    const read = 'process.env.TRACING_DUMP)';
    if (!code.includes(read)) {
      this.error(`Expected \`${read}\` in ${id}`);
    }
    // `map: null` keeps the existing mappings, which stay right because no line moves.
    return {
      code: code.replace(read, '(() => { try { return process.env.TRACING_DUMP } catch { return undefined } })())'),
      map: null,
    };
  },
};

// Bundling files from the repo-root `node_modules` moves the common source ancestor up to the
// repo root, so `preserveModules` names our own files `packages/server-runtime-injection/src/...` —
// strip that prefix to keep the `build/cjs/register.js` layout the `exports` map points at. A vendored
// dependency is named by its path after the last `node_modules/`, because pnpm installs some of them
// in nested or `.pnpm` folders. And npm never packs `node_modules` directories, so the vendored
// dependencies are emitted under `vendored/`.
const sanitizedFileNames = info =>
  `${info.name.replace(/^packages\/server-runtime-injection\/src\//, '').replace(/^.*node_modules\//, 'vendored/')}.js`;

// The vendored dependencies (see above) are third-party code redistributed inside this package's
// published `build/`, so their licenses require us to carry each one's copyright/permission notice
// (and, for Apache-2.0 deps like `@apm-js-collab/*`, the upstream NOTICE). Bundling strips per-file
// banners, so instead we aggregate them into a single `build/THIRD-PARTY-LICENSES.txt`.
const thirdPartyLicensePlugin = license({
  thirdParty: {
    includePrivate: false,
    output: {
      file: 'build/THIRD-PARTY-LICENSES.txt',
    },
  },
});

// Split so a downstream bundler that inlines this package can drop the parse/query/generate/sourcemap
// libraries. They are only reached through the `code-transformer` factory, whose failures surface as
// the "bundled into your application" warning in `register.ts` instead of a crash.
const SPLITTABLE_VENDORED = /vendored\/(meriyah|astring|source-map|esquery)\//;

const orchestrionRuntimeHooks = [
  // The side-effecting `--import` entry SDKs reference via a `--import` flag. We pass it through
  // rolldown only to copy it to `build/import-hook.mjs` at the path the package.json `exports` map
  // expects; `external: /.*/` keeps every import (`@sentry/server-runtime-injection/register`) a
  // runtime resolution against the installed package.
  defineConfig({
    input: 'src/import-hook.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/import-hook.mjs' },
  }),
];

export default [
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `register.ts` backs `./register` (the Node SDK `require`s it synchronously from
      // `Sentry.init()`); `hook.mjs` backs `./hook` (the async `Module.register()` target, loaded on
      // Node's ESM loader thread, which cannot resolve bare specifiers into the vendored chunks — but
      // relative imports work, so it shares the ESM build's vendored chunks). `./hook` only maps its
      // `import` condition, so the `build/cjs` copy is unused.
      entrypoints: ['src/register.ts', 'src/hook.mjs'],
      packageSpecificConfig: {
        plugins: [
          debugShim,
          guardTracingDump,
          plugins.makeEsqueryCjsAliasPlugin(),
          thirdPartyLicensePlugin,
          plugins.makeBuiltinRequireShimPlugin(),
          plugins.makeCjsExportsSplitPlugin(SPLITTABLE_VENDORED),
        ],
        output: {
          exports: 'named',
          preserveModules: true,
          entryFileNames: sanitizedFileNames,
          // The vendored dependencies import builtins unprefixed (`import … from 'tty'`), which Deno
          // rejects and vite-node (Node 26) misresolves as a relative path. Emit them `node:`-prefixed.
          paths: Object.fromEntries(builtinModules.map(m => [m, `node:${m}`])),
        },
      },
    }),
  ),
];
