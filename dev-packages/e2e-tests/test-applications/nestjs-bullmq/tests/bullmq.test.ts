import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-bullmq';

function waitForProcessSpan(): Promise<unknown> {
  return waitForStreamedSpan(APP_NAME, span => span.is_segment && getSpanOp(span) === 'queue.process');
}

/**
 * The `/check-isolation` route reports the leaked breadcrumbs it can see as a span attribute,
 * because streamed spans carry no breadcrumbs of their own.
 */
async function getLeakedBreadcrumbs(baseURL: string): Promise<string[]> {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  const attribute = (await segmentSpanPromise).attributes['isolation_scope.leaked_breadcrumbs'];

  // A route that stopped reporting would make every `not.toContain` below pass for the wrong
  // reason, so require the attribute rather than defaulting it away.
  expect(attribute).toEqual({ type: 'array', value: expect.any(Array) });

  return attribute!.value as string[];
}

test('Sends exception to Sentry on error in @Processor process method', async ({ baseURL }) => {
  const errorEventPromise = waitForError(APP_NAME, event => {
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

test('Creates a segment span for successful job processing', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && getSpanOp(span) === 'queue.process';
  });

  // Enqueue a job that will succeed
  await fetch(`${baseURL}/enqueue/success`);

  const span = await spanPromise;

  // Streamed messaging spans are named `<operation> <destination>`, the other way around from the
  // transaction name.
  expect(span.name).toBe('process test-queue');
  expect(span.attributes['sentry.origin']).toEqual({ value: 'auto.queue.nestjs.bullmq', type: 'string' });
});

test('BullMQ processor breadcrumbs do not leak into subsequent HTTP requests', async ({ baseURL }) => {
  const processSpanPromise = waitForProcessSpan();

  // Enqueue a job that adds a breadcrumb during processing
  await fetch(`${baseURL}/enqueue/breadcrumb-test`);

  await processSpanPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-bullmq-processor');
});

test('BullMQ @OnWorkerEvent completed lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const callbackPromise = waitForError(APP_NAME, event => event.message === 'BullMQ completed lifecycle callback');

  await fetch(`${baseURL}/enqueue/lifecycle-breadcrumb-test`);

  await callbackPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-lifecycle-event');
});

test('BullMQ @OnWorkerEvent active lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const callbackPromise = waitForError(APP_NAME, event => event.message === 'BullMQ active lifecycle callback');

  await fetch(`${baseURL}/enqueue/lifecycle-active-breadcrumb-test`);

  await callbackPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-active-event');
});

test('BullMQ @OnWorkerEvent failed lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const callbackPromise = waitForError(APP_NAME, event => event.message === 'BullMQ failed lifecycle callback');

  await fetch(`${baseURL}/enqueue/lifecycle-failed-breadcrumb-test`);

  await callbackPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-failed-event');
});

test('BullMQ @OnWorkerEvent progress lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processSpanPromise = waitForProcessSpan();

  await fetch(`${baseURL}/enqueue/lifecycle-progress-breadcrumb-test`);

  await processSpanPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-progress-event');
});

test('Shares job context across worker lifecycle callbacks and async boundaries', async ({ baseURL }) => {
  const processEventPromise = waitForError(APP_NAME, event => event.message === 'BullMQ shared lifecycle process');
  const completedEventPromise = waitForError(APP_NAME, event => event.message === 'BullMQ shared lifecycle completed');

  const response = await fetch(`${baseURL}/enqueue/shared-lifecycle-context`);
  const { jobId } = await response.json();
  const [processEvent, completedEvent] = await Promise.all([processEventPromise, completedEventPromise]);

  expect([processEvent.tags?.['lifecycle.job_id'], completedEvent.tags?.['lifecycle.job_id']]).toEqual([jobId, jobId]);
  expect([processEvent.tags?.['lifecycle.progress'], completedEvent.tags?.['lifecycle.progress']]).toEqual([
    'received',
    'received',
  ]);
  expect([processEvent.user?.id, completedEvent.user?.id]).toEqual([jobId, jobId]);
  expect(
    processEvent.breadcrumbs
      ?.filter(breadcrumb => breadcrumb.category === 'bullmq.lifecycle')
      .map(breadcrumb => breadcrumb.message),
  ).toEqual(['active', 'process', 'progress', 'process-after-progress']);
  expect(
    completedEvent.breadcrumbs
      ?.filter(breadcrumb => breadcrumb.category === 'bullmq.lifecycle')
      .map(breadcrumb => breadcrumb.message),
  ).toEqual(['active', 'process', 'progress', 'process-after-progress', 'completed']);
});

test('Isolates async queue event listeners from other notifications and HTTP requests', async ({ baseURL }) => {
  const firstEventPromise = waitForError(APP_NAME, event =>
    event.message?.startsWith('BullMQ queue lifecycle callback '),
  );

  const firstResponse = await fetch(`${baseURL}/enqueue/queue-event-isolation`);
  const { jobId: firstJobId } = await firstResponse.json();
  const firstEvent = await firstEventPromise;

  const secondEventPromise = waitForError(APP_NAME, event =>
    event.message?.startsWith('BullMQ queue lifecycle callback '),
  );
  const secondResponse = await fetch(`${baseURL}/enqueue/queue-event-isolation`);
  const { jobId: secondJobId } = await secondResponse.json();
  const secondEvent = await secondEventPromise;

  expect([firstEvent.tags?.['queue_event.job_id'], secondEvent.tags?.['queue_event.job_id']]).toEqual([
    firstJobId,
    secondJobId,
  ]);
  expect([firstEvent.extra, secondEvent.extra]).toEqual([
    { previousJobId: null, previousBreadcrumbs: [] },
    { previousJobId: null, previousBreadcrumbs: [] },
  ]);
  expect(
    firstEvent.breadcrumbs
      ?.filter(breadcrumb => breadcrumb.category === 'bullmq.queue_event')
      .map(breadcrumb => breadcrumb.message),
  ).toEqual([`leaked-breadcrumb-from-queue-event-${firstJobId}`]);
  expect(
    secondEvent.breadcrumbs
      ?.filter(breadcrumb => breadcrumb.category === 'bullmq.queue_event')
      .map(breadcrumb => breadcrumb.message),
  ).toEqual([`leaked-breadcrumb-from-queue-event-${secondJobId}`]);
  expect(await getLeakedBreadcrumbs(baseURL!)).toEqual([]);
});
