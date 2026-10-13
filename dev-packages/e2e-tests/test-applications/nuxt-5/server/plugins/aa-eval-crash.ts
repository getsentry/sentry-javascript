import { definePlugin } from 'nitro';

// Throws during module evaluation, before any plugin function runs.
// The `aa-` prefix makes this the first scanned plugin.
if (process.env.SENTRY_TEST_EVAL_CRASH) {
  throw new Error('eval-crash-test');
}

export default definePlugin(() => {});
