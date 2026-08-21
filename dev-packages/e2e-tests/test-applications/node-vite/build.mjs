// Bundles the entrypoint with Vite twice:
//   - `plain`:  no Sentry plugin — the runtime diagnostics-channel injection is bundled (v11 default).
//   - `plugin`: with `sentryVitePlugin` (build-time instrumentation), which defaults
//               `bundleSizeOptimizations.excludeChannelInjection` to `true`, so Vite/Rollup
//               tree-shakes the runtime injection out.
// assert.mjs inspects both outputs.
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { sentryVitePlugin } from '@sentry/node/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(name, plugins) {
  return build({
    logLevel: 'silent',
    build: {
      outDir: join(__dirname, 'dist', name),
      emptyOutDir: true,
      minify: true,
      lib: { entry: join(__dirname, 'src', 'entry.mjs'), formats: ['es'], fileName: 'main' },
      rollupOptions: { external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)] },
    },
    plugins,
  });
}

await run('plain', []);
await run(
  'plugin',
  // No auth/release/telemetry — we only care about the build-time transforms and defines.
  [
    sentryVitePlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
);

// eslint-disable-next-line no-console
console.log('built plain + plugin with vite');
