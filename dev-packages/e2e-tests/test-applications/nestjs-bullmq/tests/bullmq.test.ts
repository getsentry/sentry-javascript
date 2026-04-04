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

test('BullMQ @OnWorkerEvent completed lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
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
  expect(leakedBreadcrumb).toBeUndefined();
});

test('BullMQ @OnWorkerEvent active lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processTransactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  await fetch(`${baseURL}/enqueue/lifecycle-active-breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-active-event',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});

test('BullMQ @OnWorkerEvent failed lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processTransactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  await fetch(`${baseURL}/enqueue/lifecycle-failed-breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-failed-event',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});

// The 'progress' event does NOT leak breadcrumbs — unlike 'active', 'completed', and 'failed',
// BullMQ emits it inside the process() call (via job.updateProgress()), so it runs within
// the isolation scope already established by the instrumentation.
test('BullMQ @OnWorkerEvent progress lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processTransactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.process';
  });

  await fetch(`${baseURL}/enqueue/lifecycle-progress-breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('nestjs-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-progress-event',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});
