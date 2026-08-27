// Bundles the entrypoint with esbuild four ways, each a directly-runnable CJS bundle:
//   - `plain` / `plugin`:                   graphql inlined. Only `plugin` (with `sentryEsbuildPlugin`)
//                                           build-time instruments it. Run without `--import`.
//   - `plain-external` / `plugin-external`: graphql kept external so the runtime `--import` hook can
//                                           intercept it at load time. Run with `--import`.
// esbuild emits CJS (not ESM): its ESM output can't perform the CJS `require('node:async_hooks')` that
// `@sentry/server-utils` does once inlined, and CJS is the normal esbuild node target. `assert.mjs`
// runs all four and checks the query works and that exactly one set of graphql spans is emitted in
// each instrumented scenario. Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

// No auth/release/telemetry — we only care about the build-time transforms and defines.
const makeSentryPlugin = () =>
  sentryEsbuildPlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  });

function run(name, { external, plugins }) {
  return build({
    entryPoints: [join(__dirname, 'src', 'entry.mjs')],
    outfile: join(__dirname, 'dist', name, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    // The `*-external` variants keep graphql out of the bundle, so it is resolved from node_modules at
    // runtime and the `--import` hook can transform it as it loads.
    external: external ? ['graphql'] : [],
    minify: false,
    logLevel: 'silent',
    plugins,
  });
}

await run('plain', { external: false, plugins: [] });
await run('plugin', { external: false, plugins: [makeSentryPlugin()] });
await run('plain-external', { external: true, plugins: [] });
await run('plugin-external', { external: true, plugins: [makeSentryPlugin()] });

// eslint-disable-next-line no-console
console.log('built plain + plugin (inlined) and plain-external + plugin-external with esbuild');
