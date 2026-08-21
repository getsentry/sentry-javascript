// Bundles the entrypoint with Rollup twice:
//   - `plain`:  no Sentry plugin — the runtime diagnostics-channel injection is bundled (v11 default).
//   - `plugin`: with `sentryRollupPlugin` (build-time instrumentation), which defaults
//               `bundleSizeOptimizations.excludeChannelInjection` to `true`, so Rollup tree-shakes
//               the runtime injection out.
// assert.mjs inspects both outputs.
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { sentryRollupPlugin } from '@sentry/node/rollup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const external = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];

async function run(name, extra) {
  const bundle = await rollup({
    input: join(__dirname, 'src', 'entry.mjs'),
    external,
    plugins: [nodeResolve({ exportConditions: ['node', 'import', 'default'] }), commonjs(), ...extra],
    onwarn: () => {},
  });
  await bundle.write({ dir: join(__dirname, 'dist', name), format: 'es', entryFileNames: 'main.mjs' });
  await bundle.close();
}

await run('plain', []);
await run(
  'plugin',
  // `sentryRollupPlugin` returns an array of Rollup plugins. No auth/release/telemetry — we only care
  // about the build-time transforms and defines.
  sentryRollupPlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  }),
);

// eslint-disable-next-line no-console
console.log('built plain + plugin with rollup');
