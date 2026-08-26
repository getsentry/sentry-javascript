/**
 * Asserts that `sentryRollupPlugin` performs build-time instrumentation when bundling with Rolldown: its code transform injects
 * the orchestrion "bundler ran" banner into the entry chunk. A plain build (no plugin) does not.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A distinctive slice of the orchestrion banner that the bundler plugin's build-time code transform
// prepends to the entry chunk (see `ORCHESTRION_BUNDLER_MARKER_BANNER` in `@sentry/server-utils`).
// It is emitted only when the plugin's build-time instrumentation runs, so it tells a `plugin` build
// apart from a `plain` one. We match against a whitespace-stripped bundle because some bundlers
// (e.g. Rolldown) pretty-print the injected banner rather than emitting it verbatim.
const BUILD_TIME_TRANSFORM_MARKER = 'g.bundler=g.bundler||[]';

function bundleText(name) {
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  };
  walk(join(__dirname, 'dist', name));
  return files
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
    .replace(/\s+/g, '');
}

let failed = false;
function check(condition, message) {
  // eslint-disable-next-line no-console
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failed = true;
}

const plain = bundleText('plain');
const plugin = bundleText('plugin');

check(!plain.includes(BUILD_TIME_TRANSFORM_MARKER), 'plain build (no plugin) does not run build-time instrumentation');
check(
  plugin.includes(BUILD_TIME_TRANSFORM_MARKER),
  'sentryRollupPlugin runs build-time instrumentation (injects the orchestrion banner)',
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
