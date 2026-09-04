import { definePlugin } from 'nitro';

// Throws while nitro runs its plugins, before `listen`.
// The `zz-` prefix makes this the last scanned plugin (`aa-eval-crash.ts` covers the earliest point).
export default definePlugin(() => {
  if (process.env.SENTRY_TEST_STARTUP_CRASH) {
    throw new Error('startup-crash-test');
  }
});
