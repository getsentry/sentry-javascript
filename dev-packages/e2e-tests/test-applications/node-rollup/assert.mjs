/**
 * Asserts that the Sentry rollup plugin excludes the *runtime* diagnostics-channel injection by
 * default (because it instruments at build time instead), while a plain build keeps it.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// This string literal lives only in `@sentry/server-utils`' runtime injection module
// (`orchestrion/runtime/register.ts`) — the code `registerDiagnosticsChannelInjection()` pulls in.
// Its presence means the runtime injection was bundled; its absence means it was tree-shaken.
const RUNTIME_INJECTION_MARKER = 'Registered diagnostics-channel injection';

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

const plain = bundleText('plain');
const plugin = bundleText('plugin');

check(
  plain.includes(RUNTIME_INJECTION_MARKER),
  'plain build (no plugin) bundles the runtime channel injection by default',
);
check(
  !plugin.includes(RUNTIME_INJECTION_MARKER),
  'sentryRollupPlugin excludes the runtime channel injection by default (build-time instrumentation)',
);

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
