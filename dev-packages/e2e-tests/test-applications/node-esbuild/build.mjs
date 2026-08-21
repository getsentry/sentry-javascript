// Bundles the entrypoint with esbuild twice:
//   - `plain`:  no Sentry plugin — the runtime diagnostics-channel injection is bundled (v11 default).
//   - `plugin`: with `sentryEsbuildPlugin` (build-time instrumentation).
// assert.mjs inspects both outputs. Note: unlike webpack/vite/rollup, esbuild's single-pass
// tree-shaking does not drop the (now dead) runtime injection code, so this app only asserts the
// plugin build succeeds — see assert.mjs.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(name, plugins) {
  return build({
    entryPoints: [join(__dirname, 'src', 'entry.mjs')],
    outfile: join(__dirname, 'dist', name, 'main.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    minify: true,
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
