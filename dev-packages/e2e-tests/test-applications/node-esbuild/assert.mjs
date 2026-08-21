/**
 * Asserts that a plain esbuild build bundles the runtime diagnostics-channel injection by default,
 * and that the Sentry esbuild plugin build (build-time instrumentation) succeeds.
 *
 * NOTE: unlike webpack/vite/rollup, esbuild's single-pass tree-shaking does NOT remove the runtime
 * injection when `bundleSizeOptimizations.excludeChannelInjection` is defaulted on by the plugin: the
 * `if (useChannelInjection)` branch goes dead (so it never runs at runtime), but esbuild keeps the
 * module in the bundle. We therefore don't assert its absence here — we only assert the plugin build
 * succeeds. The runtime-behavior side of this is covered by the node-vite-runtime-injection app.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

check(plain.includes(RUNTIME_INJECTION_MARKER), 'plain build bundles the runtime channel injection by default');
check(plugin.length > 0, 'sentryEsbuildPlugin build (build-time instrumentation) succeeds');

if (failed) {
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('All bundle assertions passed.');
