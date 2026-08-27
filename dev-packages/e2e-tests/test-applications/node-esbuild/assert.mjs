/**
 * Runs both built bundles and asserts that build-time instrumentation actually fires at runtime:
 *   - both builds: the graphql query returns data (the SDK/plugin doesn't break the app or crash the
 *     bundle at boot),
 *   - `plugin` build: graphql auto-spans appear with origin `auto.graphql.diagnostic_channel`,
 *   - `plain` build: they do not (negative control — no plugin, runtime hook disabled).
 *
 * A boot crash surfaces as a non-zero child exit / missing `__RESULT__` line, which fails the assert
 * rather than being silently swallowed.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRAPHQL_ORIGIN = 'auto.graphql.diagnostic_channel';

// Entry filename varies by output format (`.mjs` for ESM bundlers, `.cjs` for esbuild's node/CJS output).
function entryPath(name) {
  const dir = join(__dirname, 'dist', name);
  const entry = ['main.mjs', 'main.cjs', 'main.js'].map(f => join(dir, f)).find(existsSync);
  if (!entry) throw new Error(`no built entry (main.mjs/.cjs/.js) found in ${dir}`);
  return entry;
}

function runBundle(name) {
  const stdout = execFileSync(process.execPath, [entryPath(name)], { encoding: 'utf8' });
  const line = stdout.split('\n').find(l => l.startsWith('__RESULT__'));
  if (!line) {
    throw new Error(`${name} build did not print a __RESULT__ line. Output:\n${stdout}`);
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

let failed = false;
function check(condition, message) {
  // eslint-disable-next-line no-console
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failed = true;
}

const plain = runBundle('plain');
const plugin = runBundle('plugin');

const hasGraphqlOrigin = result => result.spans.some(s => s.origin === GRAPHQL_ORIGIN);

check(plain.data?.hello === 'world', 'plain build: graphql query works');
check(plugin.data?.hello === 'world', 'plugin build: graphql query works');
check(
  !hasGraphqlOrigin(plain),
  'plain build (no plugin) does not auto-instrument graphql (no auto.graphql.diagnostic_channel span)',
);
check(
  hasGraphqlOrigin(plugin),
  'Sentry bundler plugin auto-instruments graphql at build time (emits auto.graphql.diagnostic_channel span)',
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
