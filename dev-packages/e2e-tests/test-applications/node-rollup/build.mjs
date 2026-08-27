// Bundles the entrypoint with Rollup twice, each a directly-runnable ESM bundle with `graphql`
// inlined (only node builtins stay external):
//   - `plain`:  no Sentry plugin -> graphql is not instrumented.
//   - `plugin`: with `sentryRollupPlugin` -> the orchestrion transform instruments graphql at build
//     time.
// `assert.mjs` runs both bundles and checks the graphql query works and which auto-spans appear.
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { sentryRollupPlugin } from '@sentry/node/rollup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const external = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

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
