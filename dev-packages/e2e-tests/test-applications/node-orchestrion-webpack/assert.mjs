/**
 * Asserts the orchestrion subtree is tree-shaken out of the bundle unless the
 * app opted in via `experimentalUseDiagnosticsChannelInjection()`.
 *
 * @module
 */
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

let failed = false;
function check(condition, message) {
  // eslint-disable-next-line no-console
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failed = true;
}

const noOrchestrion = bundleText('no-orchestrion');
const withOrchestrion = bundleText('with-orchestrion');

check(
  !noOrchestrion.includes(MARKER),
  'orchestrion is EXCLUDED when experimentalUseDiagnosticsChannelInjection() is NOT called',
);
check(
  withOrchestrion.includes(MARKER),
  'orchestrion is INCLUDED when experimentalUseDiagnosticsChannelInjection() IS called',
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle tree-shaking assertions passed.');
