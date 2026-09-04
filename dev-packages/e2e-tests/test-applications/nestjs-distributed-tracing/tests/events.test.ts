import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { waitForError, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-distributed-tracing';

function waitForSegmentSpan(name: string): Promise<SerializedStreamedSpan> {
  return waitForStreamedSpan(APP_NAME, span => span.is_segment && span.name === name);
}

test('Event emitter', async () => {
  const eventErrorPromise = waitForError(APP_NAME, errorEvent => {
    return errorEvent.exception.values[0].value === 'Test error from event handler';
  });
  const successEventSpanPromise = waitForSegmentSpan('event myEvent.pass');

  const eventsUrl = `http://localhost:3050/events/emit`;
  await fetch(eventsUrl);

  const eventError = await eventErrorPromise;
  const successEventSpan = await successEventSpanPromise;

  expect(eventError.exception).toEqual({
    values: [
      {
        type: 'Error',
        value: 'Test error from event handler',
        stacktrace: expect.any(Object),
        mechanism: {
          handled: false,
          type: 'auto.event.nestjs',
        },
      },
    ],
  });

  expect(successEventSpan).toMatchObject({
    is_segment: true,
    status: 'ok',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'function' },
      'sentry.origin': { type: 'string', value: 'auto.event.nestjs' },
      'sentry.segment.name.source': { type: 'string', value: 'custom' },
    }),
  });
});

test('Event handler breadcrumbs do not leak into subsequent HTTP requests', async () => {
  // The app emits 'test-isolation.breadcrumb' every 2s via setInterval (outside HTTP context).
  // The handler adds a breadcrumb. Without isolation scope forking, this breadcrumb leaks
  // into the default isolation scope and gets cloned into subsequent HTTP requests.

  // Wait for at least one setInterval tick to fire and add the breadcrumb
  await new Promise(resolve => setTimeout(resolve, 3000));

  const segmentSpanPromise = waitForSegmentSpan('GET /events/test-isolation');

  await fetch('http://localhost:3050/events/test-isolation');

  const segmentSpan = await segmentSpanPromise;

  // Streamed spans carry no breadcrumbs, so the route reports its isolation scope as an attribute
  expect(segmentSpan.attributes['isolation_scope.breadcrumb_messages']?.value).not.toContain(
    'leaked-breadcrumb-from-event-handler',
  );
});

test('Multiple OnEvent decorators', async () => {
  // Both handler invocations produce a segment span of the same name in traces of their own, so
  // they are accumulated rather than awaited one by one - two `waitFor` calls would both resolve
  // with whichever span arrives first.
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  const rootSpanPromise = waitForSegmentSpan('GET /events/emit-multiple');

  const eventsUrl = `http://localhost:3050/events/emit-multiple`;
  await fetch(eventsUrl);

  const rootSpan = await rootSpanPromise;

  const findHandlerSpans = () =>
    streamedSpans.filter(span => span.is_segment && span.name === 'event multiple.first|multiple.second');
  await expect.poll(() => findHandlerSpans().length).toBe(2);

  // Streamed spans carry no scope tags, so the app reports its isolation scope as an attribute.
  // The tags belong to the event handlers' isolation scopes, not to the root HTTP request's.
  const handlerTagKeys = findHandlerSpans().flatMap(
    span => (span.attributes['isolation_scope.tag_keys']?.value as string[]) ?? [],
  );
  expect(handlerTagKeys).toEqual(expect.arrayContaining(['test-first', 'test-second']));

  const rootTagKeys = rootSpan.attributes['isolation_scope.tag_keys']?.value as string[];
  expect(rootTagKeys).not.toContain('test-first');
  expect(rootTagKeys).not.toContain('test-second');
});
