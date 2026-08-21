// Bundles the entrypoint with Rolldown twice:
//   - `plain`:  no Sentry plugin.
//   - `plugin`: with `sentryRollupPlugin` (build-time instrumentation).
// Only the `plugin` build runs the orchestrion code transform, which prepends the "bundler ran"
// banner to the entry chunk. Kept unminified so assert.mjs can match the banner verbatim.
// Rolldown is Rollup API-compatible, so it consumes the same `@sentry/node/rollup` plugin; it also
// resolves node modules and CommonJS natively, so no extra resolve/commonjs plugins are needed.
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { sentryRollupPlugin } from '@sentry/node/rollup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const external = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];

async function run(name, extra) {
  const bundle = await rolldown({
    input: join(__dirname, 'src', 'entry.mjs'),
    external,
    plugins: [...extra],
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
console.log('built plain + plugin with rolldown');
