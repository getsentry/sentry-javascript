// Bundles the entrypoint with esbuild twice, each a directly-runnable bundle with `graphql` inlined
// (only node builtins stay external):
//   - `plain`:  no Sentry plugin -> graphql is not instrumented.
//   - `plugin`: with `sentryEsbuildPlugin` -> the orchestrion transform instruments graphql at build
//     time.
// `assert.mjs` runs both bundles and checks the graphql query works and which auto-spans appear.
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

function run(name, plugins) {
  return build({
    entryPoints: [join(__dirname, 'src', 'entry.mjs')],
    outfile: join(__dirname, 'dist', name, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
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
