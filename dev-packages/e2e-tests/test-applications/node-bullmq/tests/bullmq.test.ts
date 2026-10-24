import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForMetric, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a queue.publish span when adding a job', async ({ baseURL }) => {
  const publishSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return getSpanOp(span) === 'queue.publish' && span.attributes['messaging.bullmq.job.name']?.value === 'publish-job';
  });

  await fetch(`${baseURL}/enqueue/publish-job`);

  const publishSpan = await publishSpanPromise;

  expect(publishSpan.name).toBe('add test-queue.publish-job');
  expect(publishSpan.is_segment).toBe(false);
  expect(publishSpan.status).toBe('ok');
  expect(publishSpan.attributes).toEqual({
    'sentry.op': { type: 'string', value: 'queue.publish' },
    'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
    'messaging.system': { type: 'string', value: 'bullmq' },
    'messaging.destination.name': { type: 'string', value: 'test-queue' },
    'messaging.operation.name': { type: 'string', value: 'add' },
    'messaging.message.id': { type: 'string', value: expect.any(String) },
    'messaging.bullmq.job.name': { type: 'string', value: 'publish-job' },
    'sentry.environment': { type: 'string', value: 'production' },
    'sentry.is_localhost': { type: 'boolean', value: true },
    'sentry.release': { type: 'string', value: '1.0' },
    'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node' },
    'sentry.sdk.version': { type: 'string', value: expect.any(String) },
    'sentry.segment.id': { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
    'sentry.segment.name': { type: 'string', value: 'GET /enqueue/:jobName' },
    'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
  });
});

test('Creates a segment span for queue.process when processing a job', async ({ baseURL }) => {
  const processSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'queue.process' &&
      span.attributes['messaging.bullmq.job.name']?.value === 'process-job'
    );
  });

  await fetch(`${baseURL}/enqueue/process-job`);

  const processSpan = await processSpanPromise;

  expect(processSpan.name).toBe('process test-queue');
  expect(processSpan.status).toBe('ok');
  expect(processSpan.attributes).toEqual({
    'sentry.op': { type: 'string', value: 'queue.process' },
    'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.consumer' },
    'messaging.system': { type: 'string', value: 'bullmq' },
    'messaging.destination.name': { type: 'string', value: 'test-queue' },
    'messaging.operation.name': { type: 'string', value: 'process' },
    'messaging.message.id': { type: 'string', value: expect.any(String) },
    'messaging.message.retry.count': { type: 'integer', value: 0 },
    'messaging.client.id': { type: 'string', value: expect.any(String) },
    'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
    'messaging.bullmq.job.processed_timestamp': { type: 'integer', value: expect.any(Number) },
    'messaging.bullmq.job.attempt_finished_timestamp': { type: 'integer', value: expect.any(Number) },
    'sentry.environment': { type: 'string', value: 'production' },
    'sentry.is_localhost': { type: 'boolean', value: false },
    'sentry.release': { type: 'string', value: '1.0' },
    'sentry.sample_rate': { type: 'integer', value: 1 },
    'sentry.sdk.integrations': { type: 'array', value: expect.any(Array) },
    'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node' },
    'sentry.sdk.version': { type: 'string', value: expect.any(String) },
    'sentry.segment.id': { type: 'string', value: processSpan.span_id },
    'sentry.segment.name': { type: 'string', value: 'process test-queue' },
    'sentry.segment.name.source': { type: 'string', value: 'custom' },
    'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
  });
});

test('Sends exception to Sentry on error in job processor', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-bullmq', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Test error from BullMQ processor';
  });
  const processSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'queue.process' &&
      span.attributes['messaging.bullmq.job.name']?.value === 'fail-job'
    );
  });

  await fetch(`${baseURL}/enqueue/fail-job`);

  const errorEvent = await errorEventPromise;
  const processSpan = await processSpanPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.queue.bullmq',
  });
  expect(processSpan.status).toBe('error');
  expect(errorEvent.contexts?.trace?.trace_id).toBe(processSpan.trace_id);
  expect(errorEvent.contexts?.trace?.span_id).toBe(processSpan.span_id);
});

test('BullMQ processor breadcrumbs do not leak into subsequent HTTP requests', async ({ baseURL }) => {
  const processSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'queue.process' &&
      span.attributes['messaging.bullmq.job.name']?.value === 'breadcrumb-job'
    );
  });

  await fetch(`${baseURL}/enqueue/breadcrumb-job`);

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

test('Links the queue.process segment span to its producer span', async ({ baseURL }) => {
  const producerSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return getSpanOp(span) === 'queue.publish' && span.attributes['messaging.bullmq.job.name']?.value === 'link-job';
  });

  const consumerSpanPromise = waitForStreamedSpan('node-bullmq', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'queue.process' &&
      span.attributes['messaging.bullmq.job.name']?.value === 'link-job'
    );
  });

  await fetch(`${baseURL}/enqueue/link-job`);

  const producerSpan = await producerSpanPromise;
  const consumerSpan = await consumerSpanPromise;

  expect(producerSpan.name).toBe('add test-queue.link-job');
  expect(consumerSpan.name).toBe('process test-queue');
  expect(consumerSpan.trace_id).not.toBe(producerSpan.trace_id);
  expect(consumerSpan.links).toEqual([
    {
      trace_id: producerSpan.trace_id,
      span_id: producerSpan.span_id,
      sampled: true,
      attributes: { 'sentry.link.type': { type: 'string', value: 'message_origin' } },
    },
  ]);
});

test('Emits messaging.bullmq.jobs.completed counter metric on successful job', async ({ baseURL }) => {
  const metricPromise = waitForMetric('node-bullmq', metric => {
    return (
      metric.name === 'messaging.bullmq.jobs.completed' &&
      metric.attributes?.['messaging.bullmq.job.name']?.value === 'counter-job'
    );
  });

  await fetch(`${baseURL}/enqueue/counter-job`);

  const metric = await metricPromise;

  expect({
    type: metric.type,
    unit: metric.unit,
    value: metric.value,
    attributes: metric.attributes,
  }).toEqual({
    type: 'counter',
    unit: 'none',
    value: 1,
    attributes: {
      'messaging.destination.name': { type: 'string', value: 'test-queue' },
      'messaging.bullmq.job.name': { type: 'string', value: 'counter-job' },
      'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
      'sentry.release': { type: 'string', value: '1.0' },
      'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node' },
      'sentry.sdk.version': { type: 'string', value: expect.any(String) },
      'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
      'server.address': { type: 'string', value: expect.any(String) },
    },
  });
});

test('Emits messaging.process.duration histogram metric on job completion', async ({ baseURL }) => {
  const metricPromise = waitForMetric('node-bullmq', metric => {
    return (
      metric.name === 'messaging.process.duration' &&
      metric.attributes?.['messaging.bullmq.job.name']?.value === 'duration-job'
    );
  });

  await fetch(`${baseURL}/enqueue/duration-job`);

  const metric = await metricPromise;

  expect({
    type: metric.type,
    unit: metric.unit,
    value: metric.value,
    attributes: metric.attributes,
  }).toEqual({
    type: 'distribution',
    unit: 'second',
    value: expect.any(Number),
    attributes: {
      'messaging.system': { type: 'string', value: 'bullmq' },
      'messaging.operation.name': { type: 'string', value: 'process' },
      'messaging.destination.name': { type: 'string', value: 'test-queue' },
      'messaging.bullmq.job.name': { type: 'string', value: 'duration-job' },
      'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
      'sentry.release': { type: 'string', value: '1.0' },
      'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node' },
      'sentry.sdk.version': { type: 'string', value: expect.any(String) },
      'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
      'server.address': { type: 'string', value: expect.any(String) },
    },
  });
});
