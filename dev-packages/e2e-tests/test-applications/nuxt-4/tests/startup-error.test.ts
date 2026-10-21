import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { waitForError, waitForSession } from '@sentry-internal/test-utils';

// Errors thrown between server start and `listen` (module evaluation, nitro plugin runs) must be
// captured and flushed before the process exits. Each test spawns its own server process because
// the crash kills it; events still reach the shared event proxy via the tunnel.

/** Starts the built server and resolves with its exit code. */
function spawnCrashingServer(env: Record<string, string>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['.output/server/index.mjs'], {
      // Session tracking needs a release
      env: { ...process.env, SENTRY_RELEASE: 'startup-error-test', ...env },
    });
    child.on('error', reject);
    child.on('exit', code => resolve(code));
  });
}

test('captures error and crashed session when a nitro plugin throws during startup', async () => {
  const errorPromise = waitForError('nuxt-4', event => event.exception?.values?.[0]?.value === 'startup-crash-test');
  const sessionPromise = waitForSession('nuxt-4', session => session.status === 'crashed');

  const exitCode = await spawnCrashingServer({ SENTRY_TEST_STARTUP_CRASH: '1', PORT: '3077' });

  const [errorEvent, session] = await Promise.all([errorPromise, sessionPromise]);

  expect(exitCode).toBe(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('startup-crash-test');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);
  expect(session.status).toBe('crashed');
  expect(session.errors).toBe(1);
});

test('captures error when a server module throws during bundle evaluation', async () => {
  const errorPromise = waitForError('nuxt-4', event => event.exception?.values?.[0]?.value === 'eval-crash-test');

  const exitCode = await spawnCrashingServer({ SENTRY_TEST_EVAL_CRASH: '1', PORT: '3078' });

  const errorEvent = await errorPromise;

  expect(exitCode).toBe(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('eval-crash-test');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);
});
