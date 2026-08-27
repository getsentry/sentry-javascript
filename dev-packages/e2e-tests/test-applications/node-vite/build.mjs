// Bundles the entrypoint with Vite (SSR) twice, each a directly-runnable ESM bundle with `graphql`
// inlined (only node builtins stay external):
//   - `plain`:  no Sentry plugin -> graphql is not instrumented.
//   - `plugin`: with `sentryVitePlugin` -> the orchestrion transform instruments graphql at build
//     time.
// The Sentry vite plugin's build-time code transform only applies to server builds (it gates itself
// on `consumer === 'server'`), so this uses an SSR build rather than a client `lib` build.
// `assert.mjs` runs both bundles and checks the graphql query works and which auto-spans appear.
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { sentryVitePlugin } from '@sentry/node/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

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
