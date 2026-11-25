import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('captures an error thrown in a task, in the trace of the request that ran it', async ({ request }) => {
  const errorEventPromise = waitForError('node-nitro-3', event => {
    return !!event.exception?.values?.some(v => v.value === 'This is a task error');
  });
  const segmentSpanPromise = waitForStreamedSpan('node-nitro-3', span => {
    return span.is_segment && span.name === 'GET /api/test-task-error';
  });

  await request.get('/api/test-task-error');

  const errorEvent = await errorEventPromise;
  const segmentSpan = await segmentSpanPromise;
  expect(errorEvent.exception?.values).toEqual([
    expect.objectContaining({
      type: 'Error',
      value: 'This is a task error',
      mechanism: expect.objectContaining({ handled: false, type: 'auto.function.nitro.task' }),
    }),
  ]);
  expect(errorEvent.contexts?.nitro).toEqual({ task: 'test-error' });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentSpan.trace_id);
});
