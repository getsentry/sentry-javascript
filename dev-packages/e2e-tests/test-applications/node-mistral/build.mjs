// Produces the prod-mode artifact: a single bundle whose `@mistralai/mistralai`, `dataloader` and
// `express` copies were transformed at build time by `sentryEsbuildPlugin`. Nothing is left for a
// runtime hook to do, which is what `enableRuntimeChannelInjection: false` in `instrument.mjs`
// asserts.
//
// `@sentry/node` stays external: the SDK is the subscriber, not a transform target, and inlining it
// would force its CommonJS `require('node:async_hooks')` through esbuild's ESM interop for no gain.
// CJS output for the same reason the `node-esbuild` app uses it. Left unminified so the injected
// snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

await build({
  entryPoints: [join(__dirname, 'src', 'app.mjs')],
  outfile: join(__dirname, 'dist', 'app.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['@sentry/node'],
  minify: false,
  logLevel: 'info',
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
});

// eslint-disable-next-line no-console
console.log('built dist/app.cjs with sentryEsbuildPlugin');
