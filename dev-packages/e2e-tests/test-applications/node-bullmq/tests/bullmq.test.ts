import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForMetric, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a queue.publish span when adding a job', async ({ baseURL }) => {
  const publishSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      getSpanOp(span) === 'queue.publish' && span.attributes['sentry.segment.name']?.value === 'GET /enqueue/success'
    );
  });

  await fetch(`${baseURL}/enqueue/success`);

  const publishSpan = await publishSpanPromise;

  expect(publishSpan.is_segment).toBe(false);
  expect(publishSpan.attributes['sentry.origin']?.value).toBe('auto.queue.bullmq.producer');
  expect(publishSpan.attributes['messaging.system']?.value).toBe('bullmq');
});

test('Creates a segment span for queue.process when processing a job', async ({ baseURL }) => {
  const processSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return span.is_segment && getSpanOp(span) === 'queue.process';
  });

  await fetch(`${baseURL}/enqueue/success`);

  const processSpan = await processSpanPromise;

  expect(processSpan.attributes['sentry.origin']?.value).toBe('auto.queue.bullmq.consumer');
  expect(processSpan.attributes['messaging.system']?.value).toBe('bullmq');
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
  const processSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'queue.process' &&
      span.attributes['bullmq.job.name']?.value === 'breadcrumb-job'
    );
  });

  await fetch(`${baseURL}/enqueue/breadcrumb-test`);

  await processSpanPromise;

  const errorEventPromise = waitForError('node-bullmq', event => {
    return event.exception?.values?.[0]?.value === 'Isolation check';
  });

  await fetch(`${baseURL}/check-isolation`);

  const errorEvent = await errorEventPromise;

  const leakedBreadcrumb = (errorEvent.breadcrumbs || []).find(
    (b: { message?: string }) => b.message === 'breadcrumb-from-bullmq-processor',
  );
  expect(leakedBreadcrumb).toBeUndefined();
});

test('Links the queue.process segment span to its producer span via sentry.previous_trace', async ({ baseURL }) => {
  const producerSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return getSpanOp(span) === 'queue.publish' && span.attributes['bullmq.job.name']?.value === 'link-job';
  });

  const consumerSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment && getSpanOp(span) === 'queue.process' && span.attributes['bullmq.job.name']?.value === 'link-job'
    );
  });

  await fetch(`${baseURL}/enqueue/link-test`);

  const producerSpan = await producerSpanPromise;
  const consumerSpan = await consumerSpanPromise;

  expect(producerSpan.attributes['sentry.segment.name']?.value).toBe('GET /enqueue/link-test');
  expect(consumerSpan.attributes['sentry.previous_trace']?.value).toBe(
    `${producerSpan.trace_id}-${producerSpan.span_id}-1`,
  );
  expect(consumerSpan.links).toEqual([
    {
      trace_id: producerSpan.trace_id,
      span_id: producerSpan.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
    },
  ]);
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
