import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const PROXY = 'nestjs-orchestrion';

// `@Cron`/`@Interval` auto-fire (every few seconds) and throw; the schedule
// instrumentation captures the error (no span) with the per-decorator mechanism.
test('@Cron error is captured with the cron mechanism', async () => {
  const error = await waitForError(PROXY, event => {
    return event.exception?.values?.[0]?.value === 'Test error from cron';
  });

  expect(error.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({ type: 'auto.function.nestjs.cron', handled: false }),
  );
});

test('@Interval error is captured with the interval mechanism', async () => {
  const error = await waitForError(PROXY, event => {
    return event.exception?.values?.[0]?.value === 'Test error from interval';
  });

  expect(error.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({ type: 'auto.function.nestjs.interval', handled: false }),
  );
});

// `@Timeout`'s real delay is long, so the route triggers the handler directly.
test('@Timeout error is captured with the timeout mechanism', async ({ baseURL }) => {
  const errorPromise = waitForError(PROXY, event => {
    return event.exception?.values?.[0]?.value === 'Test error from timeout';
  });

  await fetch(`${baseURL}/trigger-timeout-error`);
  const error = await errorPromise;

  expect(error.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({ type: 'auto.function.nestjs.timeout', handled: false }),
  );
});
