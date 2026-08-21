/**
 * Asserts the orchestrion subtree is bundled by default. Channel-based (orchestrion
 * diagnostics-channel) instrumentation is the v11 default, so `Sentry.init()` pulls in the
 * orchestrion code path unconditionally — there is no longer an opt-in to tree-shake it away.
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

const app = bundleText('entry');

check(app.includes(MARKER), 'orchestrion is bundled by default when Sentry.init() runs');

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
