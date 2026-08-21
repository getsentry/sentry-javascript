// Bundles the entrypoint with Vite (SSR) twice:
//   - `plain`:  no Sentry plugin.
//   - `plugin`: with `sentryVitePlugin` (build-time instrumentation).
// The Sentry vite plugin's build-time code transform only applies to server builds (it gates itself
// on `consumer === 'server'`), so this uses an SSR build rather than a client `lib` build. Only the
// `plugin` build then injects the orchestrion "bundler ran" banner into the entry chunk. Kept
// unminified so assert.mjs can match the banner verbatim.
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
      minify: false,
      // Node target so top-level await (used in the entry) is allowed; Vite otherwise defaults to a
      // browser target that rejects it.
      target: 'esnext',
      // SSR build so the plugin's build-time transform applies (it only runs for server builds).
      ssr: join(__dirname, 'src', 'entry.mjs'),
      rollupOptions: {
        external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],
        output: { entryFileNames: 'main.mjs', format: 'es' },
      },
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
