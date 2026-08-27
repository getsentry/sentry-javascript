/**
 * Asserts that a webpack-bundled server still gets orchestrion instrumentation.
 *
 * Two things are checked, and they fail for different reasons:
 *
 * 1. The orchestrion subtree is bundled at all. Channel-based (orchestrion diagnostics-channel)
 *    instrumentation is the v11 default, so `Sentry.init()` pulls in the orchestrion code path
 *    unconditionally, and there is no longer an opt-in to tree-shake it away.
 * 2. The bundle, when run, actually records channel-based spans for an external dependency. The
 *    string check above passes even when the bundler has stripped the vendored code transformer to
 *    an empty object, which leaves auto-instrumentation dead and silent
 *    (https://github.com/getsentry/sentry-javascript/issues/23664).
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `orchestrion:mysql:query` lives only in @sentry/server-utils' orchestrion
// subtree (channels.ts), never in @sentry/node — so finding it in a bundle
// means the orchestrion code path was pulled in.
const MARKER = 'orchestrion:mysql:query';

function bundleText(name) {
  const dir = join(__dirname, 'dist', name);
  return readdirSync(dir)
    .map(f => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

function runBundle(name) {
  const stdout = execFileSync('node', [join(__dirname, 'dist', name, 'main.mjs')], { encoding: 'utf-8' });
  const line = stdout.split('\n').find(l => l.startsWith('SENTRY_RESULT='));

  if (!line) {
    throw new Error(`${name} did not print SENTRY_RESULT (stdout: ${stdout})`);
  }

  return JSON.parse(line.slice('SENTRY_RESULT='.length));
}

let failed = false;
function check(condition, message) {
  // eslint-disable-next-line no-console
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failed = true;
}

const app = bundleText('entry');

check(app.includes(MARKER), 'orchestrion is bundled by default when Sentry.init() runs');

const { injected, spans } = runBundle('entry');
const detail = `injected: ${JSON.stringify(injected)}, spans: ${JSON.stringify(spans)}`;

check(injected.runtime.includes('graphql'), `the runtime hook injected channels into graphql (${detail})`);
check(
  spans.some(span => span.origin === 'auto.graphql.diagnostic_channel'),
  `the bundled app recorded channel-based graphql spans (${detail})`,
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
