import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBundlerInstrumentation } from '@sentry-internal/test-utils';
import { TARGETS } from './targets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Drives each target's four built bundles across the build-time and runtime instrumentation paths and
// asserts exactly one set of graphql spans in each instrumented scenario, plus the inlined-vs-external
// bundle shape. The external variants preload the runtime hook of the target's SDK. All targets run
// even if one fails, so a single CI run reports every broken bundler.
const failed = [];
for (const { name, sdk } of TARGETS) {
  // eslint-disable-next-line no-console
  console.log(`\n# ${name}`);
  try {
    assertBundlerInstrumentation('graphql', { appDir: join(__dirname, 'dist', name), importHook: `${sdk}/import` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    failed.push(name);
  }
}

if (failed.length) {
  throw new Error(`Bundler instrumentation assertions failed for: ${failed.join(', ')}`);
}
