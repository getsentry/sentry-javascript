// Bundles one Node suite scenario with `@sentry/bun/plugin`, so the plugin can inject the
// diagnostics channels into the libraries the scenario uses. The runner calls this script with the
// scenario path when `RUNTIME_BUILD_SCRIPT` points to it, and runs the printed output file instead.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { dirname, join, relative } from 'node:path';

const NODE_SUITES_ROOT = join(import.meta.dir, '..', '..', 'node-integration-tests');
const BUILD_ROOT = join(import.meta.dir, '..', 'build');

const entry = process.argv[2];
if (!entry) {
  // eslint-disable-next-line no-console
  console.error('BUILD_FAILED no scenario path');
  process.exit(1);
}

const result = await Bun.build({
  entrypoints: [entry],
  target: 'bun',
  // Mirrors the scenario's folder, so relative paths between scenarios keep their shape.
  outdir: join(BUILD_ROOT, relative(NODE_SUITES_ROOT, dirname(entry))),
  sourcemap: 'linked',
  // The instrument file is preloaded unbundled, so the bundle must share its `@sentry/*` packages.
  // knex requires the drivers of all its dialects, and the ones that are not installed must stay
  // external so the bundle still builds.
  external: ['@sentry/*', '@sentry-internal/*', 'better-sqlite3', 'oracledb', 'pg-query-stream', 'sqlite3'],
  plugins: [sentryBunPlugin()],
});

const output = result.outputs.find(file => file.kind === 'entry-point');
if (!result.success || !output) {
  // eslint-disable-next-line no-console
  console.error('BUILD_FAILED', result.logs);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`BUILD_OK ${output.path}`);
