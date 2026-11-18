// Bundles the entrypoint for every target four ways, each a directly-runnable bundle:
//   - `plain` / `plugin`:                   graphql inlined. Only `plugin` (with the Sentry plugin)
//                                           build-time instruments it. Run without `--import`.
//   - `plain-external` / `plugin-external`: graphql kept external, so it is resolved from node_modules
//                                           at runtime and the `--import` hook can transform it as it
//                                           loads. Run with `--import`.
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentryEsbuildPlugin as sentryAwsServerlessEsbuildPlugin } from '@sentry/aws-serverless/esbuild';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
import { sentryRollupPlugin } from '@sentry/node/rollup';
import { sentryVitePlugin } from '@sentry/node/vite';
import { sentryWebpackPlugin } from '@sentry/node/webpack';
import { bundle as esbuild } from './bundlers/esbuild.mjs';
import { bundle as rolldown } from './bundlers/rolldown.mjs';
import { bundle as rollup } from './bundlers/rollup.mjs';
import { bundle as vite } from './bundlers/vite.mjs';
import { bundle as webpack } from './bundlers/webpack.mjs';
import { TARGETS } from './targets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUNDLERS = { esbuild, rollup, rolldown, vite, webpack };

// Rolldown consumes the Rollup plugin.
const PLUGINS = {
  '@sentry/node': {
    esbuild: sentryEsbuildPlugin,
    rollup: sentryRollupPlugin,
    rolldown: sentryRollupPlugin,
    vite: sentryVitePlugin,
    webpack: sentryWebpackPlugin,
  },
  '@sentry/aws-serverless': { esbuild: sentryAwsServerlessEsbuildPlugin },
};

// Every Sentry plugin instance adds a `beforeExit` listener, and this process creates one per plugin build.
process.setMaxListeners(2 * TARGETS.length + 1);

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

for (const { name, bundler, sdk, entry } of TARGETS) {
  const bundle = BUNDLERS[bundler];
  // No auth/release/telemetry — we only care about the build-time transforms and defines.
  // `sentryRollupPlugin` returns an array of plugins, the others a single plugin.
  const makeSentryPlugins = () =>
    [
      PLUGINS[sdk][bundler]({
        telemetry: false,
        sourcemaps: { disable: true },
        release: { create: false, finalize: false, inject: false },
      }),
    ].flat();

  for (const [variant, { external, withPlugin }] of Object.entries({
    plain: { external: false, withPlugin: false },
    plugin: { external: false, withPlugin: true },
    'plain-external': { external: true, withPlugin: false },
    'plugin-external': { external: true, withPlugin: true },
  })) {
    await bundle({
      entry: join(__dirname, 'src', entry),
      outDir: join(__dirname, 'dist', name, 'dist', variant),
      external,
      plugins: withPlugin ? makeSentryPlugins() : [],
    });
  }

  // eslint-disable-next-line no-console
  console.log(`built ${name}`);
}
