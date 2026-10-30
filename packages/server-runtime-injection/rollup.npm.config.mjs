import { builtinModules } from 'node:module';
import * as path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import license from 'rollup-plugin-license';
import { defineConfig } from 'rollup';
import { FLAT_OUTPUT, makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

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
// `requireReturnsDefault: 'auto'`: node-resolve prefers a dependency's ESM build even for CJS
// `require()`s inside the vendored graph. Default-export-only ESM (e.g. esquery) must then resolve
// to the default itself, not a `{ default }` namespace — CJS callers use it as
// `require('esquery').parse(...)`.
//
// `strictRequires: false`: the default `'auto'` wraps conditionally-required modules in lazy
// initializers exported as `__require` — an export name that downstream re-bundlers mishandle
// (Turbopack renames it, producing `.require is not a function` crashes in Next.js on Cloudflare). Hoisting is safe here: the vendored graph is closed (nothing
// optional/missing) and has no require cycles that depend on lazy evaluation.
const commonJSOptions = { transformMixedEsModules: true, requireReturnsDefault: 'auto', strictRequires: false };
const commonJSPlugin = commonjs(commonJSOptions);

// Replace `debug` with `src/debug.ts`, which logs through the Sentry logger. `debug` and the
// `supports-color` it loads read `process.env` at import time, which throws on Deno without env
// permission. `order: 'pre'` because the base config's node-resolve plugin sorts ahead of
// package-specific plugins and would otherwise resolve `debug` first.
const debugShim = {
  name: 'debug-shim',
  resolveId: {
    order: 'pre',
    handler(source) {
      return source === 'debug' ? path.join(import.meta.dirname, 'src/debug.ts') : null;
    },
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

// The vendored dependencies are third-party code redistributed inside this package's
// published `build/`, so their licenses require us to carry each one's copyright/permission notice
// (and, for Apache-2.0 deps like `@apm-js-collab/*`, the upstream NOTICE). Rollup strips per-file
// banners, so instead we aggregate them into a single `build/THIRD-PARTY-LICENSES.txt`.
const thirdPartyLicensePlugin = license({
  thirdParty: {
    includePrivate: false,
    output: {
      file: 'build/THIRD-PARTY-LICENSES.txt',
    },
  },
});

const orchestrionRuntimeHooks = [
  // The side-effecting `--import` entry SDKs reference via a `--import` flag. We pass it through
  // rollup only to copy it to `build/import-hook.mjs` at the path the package.json `exports` map
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
        plugins: [debugShim, guardTracingDump, commonJSPlugin, thirdPartyLicensePlugin],
        output: {
          exports: 'named',
          ...FLAT_OUTPUT,
          // The commonjs-converted vendored dependencies import Node builtins as default imports
          // (`require('path')` → default import of `path`), and builtins have no `.default` in CJS —
          // so builtins need `'default'` interop (the module itself is the default export).
          interop: id => (id && (id.startsWith('node:') || builtinModules.includes(id)) ? 'default' : 'esModule'),
          // The vendored dependencies import builtins unprefixed (`import … from 'tty'`), which Deno
          // rejects and vite-node (Node 26) misresolves as a relative path. Emit them `node:`-prefixed.
          paths: Object.fromEntries(builtinModules.map(m => [m, `node:${m}`])),
        },
      },
    }),
  ),
];
