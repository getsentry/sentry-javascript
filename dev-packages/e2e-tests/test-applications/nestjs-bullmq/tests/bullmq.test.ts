import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exception to Sentry on error in @Processor process method', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-bullmq', event => {
    return (
      !event.type &&
      event.exception?.values?.[0]?.value === 'Test error from BullMQ processor' &&
      event.exception?.values?.[0]?.mechanism?.type === 'auto.queue.nestjs.bullmq'
    );
  });

  // Enqueue a job that will fail
  await fetch(`${baseURL}/enqueue/fail`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.queue.nestjs.bullmq',
  });
});

test('Creates a transaction for successful job processing', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  // Enqueue a job that will succeed
  await fetch(`${baseURL}/enqueue/success`);

  const transaction = await transactionPromise;

  expect(transaction.transaction).toBe('test-queue process');
  expect(transaction.contexts?.trace?.op).toBe('queue.process');
  expect(transaction.contexts?.trace?.origin).toBe('auto.queue.nestjs.bullmq');
});

test('BullMQ processor breadcrumbs do not leak into subsequent HTTP requests', async ({ baseURL }) => {
  const processTransactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  // Enqueue a job that adds a breadcrumb during processing
  await fetch(`${baseURL}/enqueue/breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-bullmq-processor',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});

// TODO: @OnWorkerEvent handlers run outside the isolation scope created by process().
// They are registered via worker.on() (EventEmitter), so breadcrumbs/tags set there
// leak into the default isolation scope and appear on subsequent HTTP requests.
// This should be fixed in a follow-up by also wrapping lifecycle event handlers.
test('BullMQ @OnWorkerEvent lifecycle breadcrumbs currently leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processTransactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  // Enqueue a job (the completed event fires right after the job is processed)
  await fetch(`${baseURL}/enqueue/lifecycle-breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-lifecycle-event',
  );
  // This SHOULD be toBeUndefined() once lifecycle event isolation is implemented.
  expect(leakedBreadcrumb).toBeDefined();
});
