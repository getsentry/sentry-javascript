// Bundles the entrypoint with Vite (SSR) four ways, each a directly-runnable ESM bundle:
//   - `plain` / `plugin`:                   graphql inlined. Only `plugin` (with `sentryVitePlugin`)
//                                           build-time instruments it. Run without `--import`.
//   - `plain-external` / `plugin-external`: graphql kept external so the runtime `--import` hook can
//                                           intercept it at load time. Run with `--import`.
// The Sentry vite plugin's build-time code transform only applies to server builds (it gates itself
// on `consumer === 'server'`), so this uses an SSR build rather than a client `lib` build.
// `assert.mjs` runs all four and checks the query works and that exactly one set of graphql spans is
// emitted in each instrumented scenario. Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { sentryVitePlugin } from '@sentry/node/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeExternals = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

// No auth/release/telemetry — we only care about the build-time transforms and defines.
const makeSentryPlugin = () =>
  sentryVitePlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  });

function run(name, { graphqlExternal, plugins }) {
  return build({
    logLevel: 'silent',
    // Whether graphql is inlined or external is governed by Vite's SSR externalization
    // (`ssr.external` / `ssr.noExternal`), NOT `rollupOptions.external`: a Vite SSR build
    // externalizes node_modules deps by default, so without an explicit `ssr.noExternal` graphql
    // stays external no matter what `rollupOptions.external` says. Set it per-variant so the
    // build-time (inlined) and runtime (external) paths are each genuinely exercised. For the
    // `*-external` variants `ssr.external` also wins over the plugin's own `noExternal` force-bundle,
    // so graphql is left for the runtime `--import` hook to transform as it loads from node_modules.
    ssr: graphqlExternal ? { external: ['graphql'] } : { noExternal: ['graphql'] },
    build: {
      outDir: join(__dirname, 'dist', name),
      emptyOutDir: true,
      minify: false,
      // Node target so top-level await (used in the entry) is allowed; Vite otherwise defaults to a
      // browser target that rejects it.
      target: 'esnext',
      // SSR build so the plugin's build-time transform applies (it only runs for server builds).
      ssr: join(__dirname, 'src', 'entry.mjs'),
      rollupOptions: {
        external: nodeExternals,
        output: { entryFileNames: 'main.mjs', format: 'es' },
      },
    },
    plugins,
  });
}

await run('plain', { graphqlExternal: false, plugins: [] });
await run('plugin', { graphqlExternal: false, plugins: [makeSentryPlugin()] });
await run('plain-external', { graphqlExternal: true, plugins: [] });
await run('plugin-external', { graphqlExternal: true, plugins: [makeSentryPlugin()] });

// eslint-disable-next-line no-console
console.log('built plain + plugin (inlined) and plain-external + plugin-external with vite');
