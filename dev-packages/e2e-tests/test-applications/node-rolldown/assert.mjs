/**
 * Runs the built bundles across the build-time and runtime instrumentation paths and asserts that
 * each instrumented scenario emits exactly one set of graphql spans — never zero, never double:
 *
 *   - `plain`            (inlined, no plugin, no `--import`): no graphql spans (negative control),
 *   - `plugin`           (inlined, plugin, no `--import`):    one set, via build-time injection,
 *   - `plain-external`   (external, no plugin, `--import`):   one set, via the runtime hook,
 *   - `plugin-external`  (external, plugin, `--import`):      one set — the plugin can't instrument
 *                                                             an external module, so the runtime hook
 *                                                             is the sole injector and there is no
 *                                                             double instrumentation.
 *
 * "One set" is defined relative to the build-time run (`plugin`), so the count stays correct across
 * bundlers and graphql versions. A boot crash surfaces as a non-zero child exit / missing `__RESULT__`
 * line, which fails the assert rather than being silently swallowed.
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

// `withImport` preloads the SDK's runtime diagnostics-channel hook, so it transforms graphql as Node
// loads it — the mechanism used for external (unbundled) dependencies.
function run(name, { withImport = false } = {}) {
  const args = withImport ? ['--import', '@sentry/node/import', entryPath(name)] : [entryPath(name)];
  const stdout = execFileSync(process.execPath, args, { encoding: 'utf8', cwd: __dirname });
  const line = stdout.split('\n').find(l => l.startsWith('__RESULT__'));
  if (!line) {
    throw new Error(`${name}${withImport ? ' (--import)' : ''} did not print a __RESULT__ line. Output:\n${stdout}`);
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

const graphqlSpanCount = result => result.spans.filter(s => s.origin === GRAPHQL_ORIGIN).length;

const scenarios = {
  plain: run('plain'),
  plugin: run('plugin'),
  plainExternalImport: run('plain-external', { withImport: true }),
  pluginExternalImport: run('plugin-external', { withImport: true }),
};

// One set of graphql spans, established by the build-time run.
const oneSet = graphqlSpanCount(scenarios.plugin);

let failed = false;
function check(condition, message) {
  // eslint-disable-next-line no-console
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failed = true;
}

for (const [label, result] of Object.entries(scenarios)) {
  check(result.data?.hello === 'world', `${label}: graphql query works`);
}

check(oneSet > 0, 'plugin build (build-time) emits a set of graphql spans');
check(graphqlSpanCount(scenarios.plain) === 0, 'plain build (no plugin, no --import) emits no graphql spans');
check(
  graphqlSpanCount(scenarios.plainExternalImport) === oneSet,
  `external build + --import emits exactly one set of graphql spans (${oneSet}) via the runtime hook`,
);
check(
  graphqlSpanCount(scenarios.pluginExternalImport) === oneSet,
  `external build + plugin + --import emits exactly one set of graphql spans (${oneSet}), not double`,
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
