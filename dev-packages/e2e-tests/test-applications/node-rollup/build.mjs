// Bundles the entrypoint with Rollup four ways, each a directly-runnable ESM bundle:
//   - `plain` / `plugin`:                   graphql inlined. Only `plugin` (with `sentryRollupPlugin`)
//                                           build-time instruments it. Run without `--import`.
//   - `plain-external` / `plugin-external`: graphql kept external so the runtime `--import` hook can
//                                           intercept it at load time. Run with `--import`.
// `assert.mjs` runs all four and checks the query works and that exactly one set of graphql spans is
// emitted in each instrumented scenario. Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { sentryRollupPlugin } from '@sentry/node/rollup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeExternals = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

// No auth/release/telemetry — we only care about the build-time transforms and defines.
const makeSentryPlugin = () =>
  // `sentryRollupPlugin` returns an array of Rollup plugins.
  sentryRollupPlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  });

async function run(name, { external, plugins }) {
  const bundle = await rollup({
    input: join(__dirname, 'src', 'entry.mjs'),
    // The `*-external` variants keep graphql out of the bundle, so it is resolved from node_modules at
    // runtime and the `--import` hook can transform it as it loads.
    external: external ? [...nodeExternals, 'graphql'] : nodeExternals,
    plugins: [nodeResolve({ exportConditions: ['node', 'import', 'default'] }), commonjs(), ...plugins],
    onwarn: () => {},
  });
  await bundle.write({ dir: join(__dirname, 'dist', name), format: 'es', entryFileNames: 'main.mjs' });
  await bundle.close();
}

await run('plain', { external: false, plugins: [] });
await run('plugin', { external: false, plugins: makeSentryPlugin() });
await run('plain-external', { external: true, plugins: [] });
await run('plugin-external', { external: true, plugins: makeSentryPlugin() });

// eslint-disable-next-line no-console
console.log('built plain + plugin (inlined) and plain-external + plugin-external with rollup');
