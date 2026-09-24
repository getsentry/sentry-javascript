import { builtinModules } from 'node:module';
import license from 'rollup-plugin-license';
import { makeBaseNPMConfig, makeNPMConfigVariants, plugins } from '@sentry-internal/rollup-utils';

// The orchestrion build-time bundler-plugin chain (`@apm-js-collab/code-transformer-bundler-plugins`
// → `@apm-js-collab/code-transformer` → meriyah/esquery/astring/…) is bundled into this package's
// build instead of installed as runtime dependencies. (The runtime injection chain lives in
// `@sentry/server-runtime-injection`.) Everything here is plain JS, and bundling removes a class of
// downstream breakage:
//
// Tracer/runtime exports-map mismatches: meriyah 6.1's `module-sync`-first exports map is
//    resolved differently by build-time tracers (`@vercel/nft`, nf3, Nitro externals) than by the
//    runtime CJS loader, producing pruned server bundles that crash with `MODULE_NOT_FOUND`
//    (https://github.com/vercel/nft/issues/603, https://github.com/nitrojs/nitro/issues/4456).
//    Bundled, there is no runtime package resolution left to get wrong.
//
// `@apm-js-collab/code-transformer-bundler-plugins` (build-time only) is bundled as well so the
// build-time and runtime transforms always ship the same `code-transformer` version, and so this
// package has no `@apm-js-collab/*` install footprint at all.
//
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

// Only the parse/query/generate/sourcemap libraries are split. They are reached exclusively through
// the lazily-invoked `code-transformer` factory, which is called inside a try/catch, so a consumer
// that drops them degrades to "no channel injection" instead of throwing. Everything else (notably
// `debug`, whose export is called at module-evaluation time) must stay non-droppable.
const SPLITTABLE_VENDORED = /vendored\/(meriyah|astring|source-map|esquery)\//;

export default [
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
        'src/orchestrion/bundler/vite.ts',
        'src/orchestrion/bundler/rollup.ts',
        'src/orchestrion/bundler/webpack.ts',
        'src/orchestrion/bundler/webpack-loader.ts',
        'src/orchestrion/bundler/esbuild.ts',
        'src/orchestrion/bundler/bun.ts',
      ],
      packageSpecificConfig: {
        plugins: [
          plugins.makeDebugNodeAliasPlugin(),
          plugins.makeEsqueryCjsAliasPlugin(),
          thirdPartyLicensePlugin,
          plugins.makeBuiltinRequireShimPlugin(),
          plugins.makeCjsExportsSplitPlugin(SPLITTABLE_VENDORED),
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
