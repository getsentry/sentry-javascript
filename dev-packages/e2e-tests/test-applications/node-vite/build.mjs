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

function run(name, { external, plugins }) {
  return build({
    logLevel: 'silent',
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
        // The `*-external` variants keep graphql out of the bundle, so it is resolved from node_modules
        // at runtime and the `--import` hook can transform it as it loads.
        external: external ? [...nodeExternals, 'graphql'] : nodeExternals,
        output: { entryFileNames: 'main.mjs', format: 'es' },
      },
    },
    plugins,
  });
}

await run('plain', { external: false, plugins: [] });
await run('plugin', { external: false, plugins: [makeSentryPlugin()] });
await run('plain-external', { external: true, plugins: [] });
await run('plugin-external', { external: true, plugins: [makeSentryPlugin()] });

// eslint-disable-next-line no-console
console.log('built plain + plugin (inlined) and plain-external + plugin-external with vite');
