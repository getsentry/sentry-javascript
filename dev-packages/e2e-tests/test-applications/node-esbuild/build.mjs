// Bundles the entrypoint with esbuild twice:
//   - `plain`:  no Sentry plugin.
//   - `plugin`: with `sentryEsbuildPlugin` (build-time instrumentation).
// Only the `plugin` build runs the orchestrion code transform, which prepends the "bundler ran"
// banner to the entry chunk. Kept unminified so the banner keeps its identifiers (a minifier would
// rename them); assert.mjs matches it whitespace-insensitively.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(name, plugins) {
  return build({
    entryPoints: [join(__dirname, 'src', 'entry.mjs')],
    outdir: join(__dirname, 'dist', name),
    bundle: true,
    platform: 'node',
    format: 'esm',
    minify: false,
    logLevel: 'silent',
    plugins,
  });
}

await run('plain', []);
await run(
  'plugin',
  // No auth/release/telemetry — we only care about the build-time transforms and defines.
  [
    sentryEsbuildPlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
);

// eslint-disable-next-line no-console
console.log('built plain + plugin with esbuild');
