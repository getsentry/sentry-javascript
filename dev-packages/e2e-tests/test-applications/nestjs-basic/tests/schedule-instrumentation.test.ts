import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exceptions to Sentry on error in @Cron decorated method', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-basic', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Test error from schedule cron';
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.schedule.nestjs.cron',
  });

  // kill cron so tests don't get stuck
  await fetch(`${baseURL}/kill-test-schedule-cron/test-schedule-cron-error`);
});

test('Sends exceptions to Sentry on error in @Interval decorated method', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-basic', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Test error from schedule interval';
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.schedule.nestjs.interval',
  });

  // kill interval so tests don't get stuck
  await fetch(`${baseURL}/kill-test-schedule-interval/test-schedule-interval-error`);
});

test('Sends exceptions to Sentry on error in @Timeout decorated method', async () => {
  const errorEventPromise = waitForError('nestjs-basic', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Test error from schedule timeout';
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.schedule.nestjs.timeout',
  });
});

test('Scheduled task breadcrumbs do not leak into subsequent HTTP requests', async ({ baseURL }) => {
  // The app runs @Interval('test-schedule-isolation', 2000) which adds a breadcrumb.
  // Without isolation scope forking, this breadcrumb leaks into the default isolation scope
  // and gets cloned into subsequent HTTP requests.

  // Wait for at least one interval tick to fire
  await new Promise(resolve => setTimeout(resolve, 3000));

  const transactionPromise = waitForTransaction('nestjs-basic', transactionEvent => {
    return transactionEvent.transaction === 'GET /test-schedule-isolation';
  });

  await fetch(`${baseURL}/test-schedule-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-schedule',
  );
  expect(leakedBreadcrumb).toBeUndefined();

  // kill interval so tests don't get stuck
  await fetch(`${baseURL}/kill-test-schedule-interval/test-schedule-isolation`);
});
