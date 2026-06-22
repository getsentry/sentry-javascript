import { expect, test } from '@playwright/test';
import { waitForError, waitForMetric, waitForTransaction } from '@sentry-internal/test-utils';

test('Creates a queue.submit span when adding a job', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /enqueue/success';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const transaction = await transactionPromise;

  const submitSpan = transaction.spans?.find(span => span.op === 'queue.submit');
  expect(submitSpan).toBeDefined();
  expect(submitSpan!.origin).toBe('auto.queue.bullmq.producer');
  expect(submitSpan!.data?.['messaging.system']).toBe('bullmq');
});

test('Creates a transaction for queue.task when processing a job', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.task';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.op).toBe('queue.task');
  expect(transaction.contexts?.trace?.origin).toBe('auto.queue.bullmq.consumer');
  expect(transaction.contexts?.trace?.data?.['messaging.system']).toBe('bullmq');
});

test('Sends exception to Sentry on error in job processor', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-bullmq', event => {
    return (
      !event.type &&
      event.exception?.values?.[0]?.value === 'Test error from BullMQ processor' &&
      event.exception?.values?.[0]?.mechanism?.type === 'auto.queue.bullmq'
    );
  });

  await fetch(`${baseURL}/enqueue/fail`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.queue.bullmq',
  });
});

test('BullMQ processor breadcrumbs do not leak into subsequent HTTP requests', async ({ baseURL }) => {
  const processTransactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.task';
  });

  await fetch(`${baseURL}/enqueue/breadcrumb-test`);

  await processTransactionPromise;

  const transactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: { message?: string }) => b.message === 'breadcrumb-from-bullmq-processor',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});

test('Links consumer transaction to producer span via sentry.previous_trace', async ({ baseURL }) => {
  const httpTransactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.transaction === 'GET /enqueue/success';
  });

  const consumerTransactionPromise = waitForTransaction('node-bullmq', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'queue.task';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const httpTransaction = await httpTransactionPromise;
  const consumerTransaction = await consumerTransactionPromise;

  const producerSpan = httpTransaction.spans?.find(span => span.op === 'queue.submit');
  expect(producerSpan).toBeDefined();

  const previousTrace = consumerTransaction.contexts?.trace?.data?.['sentry.previous_trace'];
  expect(previousTrace).toBeDefined();
  expect(previousTrace).toContain(httpTransaction.contexts?.trace?.trace_id);
});

test('Emits bullmq.jobs.completed counter metric on successful job', async ({ baseURL }) => {
  const metricPromise = waitForMetric('node-bullmq', metric => {
    return metric.name === 'bullmq.jobs.completed' && metric.type === 'counter';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const metric = await metricPromise;

  expect(metric.name).toBe('bullmq.jobs.completed');
  expect(metric.type).toBe('counter');
  expect(metric.value).toEqual(expect.any(Number));
});

test('Emits bullmq.job.duration histogram metric on job completion', async ({ baseURL }) => {
  const metricPromise = waitForMetric('node-bullmq', metric => {
    return metric.name === 'bullmq.job.duration' && metric.type === 'distribution';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const metric = await metricPromise;

  expect(metric.name).toBe('bullmq.job.duration');
  expect(metric.type).toBe('distribution');
  expect(metric.value).toEqual(expect.any(Number));
});
