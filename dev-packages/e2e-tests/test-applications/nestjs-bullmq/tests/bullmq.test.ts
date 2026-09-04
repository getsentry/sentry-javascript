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
async function getLeakedBreadcrumbs(baseURL: string): Promise<unknown> {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'GET /check-isolation';
  });

  await fetch(`${baseURL}/check-isolation`);

  return (await segmentSpanPromise).attributes['isolation_scope.leaked_breadcrumbs']?.value;
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

// TODO: @OnWorkerEvent('completed') handlers run outside the isolation scope created by process().
// They are registered via worker.on() (EventEmitter), so breadcrumbs/tags set there
// leak into the default isolation scope and appear on subsequent HTTP requests.
test('BullMQ @OnWorkerEvent completed lifecycle breadcrumbs currently leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processSpanPromise = waitForProcessSpan();

  // Enqueue a job (the completed event fires right after the job is processed)
  await fetch(`${baseURL}/enqueue/lifecycle-breadcrumb-test`);

  await processSpanPromise;

  // This SHOULD be not.toContain() once lifecycle event isolation is implemented.
  expect(await getLeakedBreadcrumbs(baseURL!)).toContain('leaked-breadcrumb-from-lifecycle-event');
});

// TODO: @OnWorkerEvent('active') handlers run outside the isolation scope created by process().
// Breadcrumbs set there leak into the default isolation scope and appear on subsequent HTTP requests.
test('BullMQ @OnWorkerEvent active lifecycle breadcrumbs currently leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processSpanPromise = waitForProcessSpan();

  await fetch(`${baseURL}/enqueue/lifecycle-active-breadcrumb-test`);

  await processSpanPromise;

  // This SHOULD be not.toContain() once lifecycle event isolation is implemented.
  expect(await getLeakedBreadcrumbs(baseURL!)).toContain('leaked-breadcrumb-from-active-event');
});

// TODO: @OnWorkerEvent('failed') handlers run outside the isolation scope created by process().
// Breadcrumbs set there leak into the default isolation scope and appear on subsequent HTTP requests.
test('BullMQ @OnWorkerEvent failed lifecycle breadcrumbs currently leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processSpanPromise = waitForProcessSpan();

  await fetch(`${baseURL}/enqueue/lifecycle-failed-breadcrumb-test`);

  await processSpanPromise;

  // This SHOULD be not.toContain() once lifecycle event isolation is implemented.
  expect(await getLeakedBreadcrumbs(baseURL!)).toContain('leaked-breadcrumb-from-failed-event');
});

// The 'progress' event does NOT leak breadcrumbs — unlike 'active', 'completed', and 'failed',
// BullMQ emits it inside the process() call (via job.updateProgress()), so it runs within
// the isolation scope already established by the instrumentation.
test('BullMQ @OnWorkerEvent progress lifecycle breadcrumbs do not leak into subsequent HTTP requests', async ({
  baseURL,
}) => {
  const processSpanPromise = waitForProcessSpan();

  await fetch(`${baseURL}/enqueue/lifecycle-progress-breadcrumb-test`);

  await processSpanPromise;

  expect(await getLeakedBreadcrumbs(baseURL!)).not.toContain('leaked-breadcrumb-from-progress-event');
});
