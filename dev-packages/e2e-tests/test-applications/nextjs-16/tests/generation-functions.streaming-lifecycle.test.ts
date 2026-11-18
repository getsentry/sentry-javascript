import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isVinext } from './isVinext';

// The request span of `withSentry` on Workers has no `http.target`, so the segment is matched by name. Tests run
// one at a time, so a segment of another test can't match.
const SEGMENT_NAME = 'GET /generation-functions';

function isSegment(span: { name: string; is_segment?: boolean }): boolean {
  return span.name === SEGMENT_NAME && !!span.is_segment;
}

// The SDK wraps generation functions only in webpack builds. Turbopack and vinext builds report their errors
// through `onRequestError`, under the name of the request.
function expectedTransaction(errorEvent: { tags?: Record<string, unknown> }, wrapperName: string): string {
  return errorEvent.tags?.turbopack || isVinext ? SEGMENT_NAME : wrapperName;
}

test('Should emit a span for a generateMetadata() function invocation', async ({ page }) => {
  const testTitle = 'should-emit-span';
  const httpTarget = `/generation-functions?metadataTitle=${testTitle}`;

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', SEGMENT_NAME);

  await page.goto(httpTarget);

  const spans = await spansPromise;
  const segmentSpan = spans.find(isSegment)!;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'generateMetadata /generation-functions/page',
      status: 'ok',
      trace_id: segmentSpan.trace_id,
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto', type: 'string' },
      }),
    }),
  );

  const pageTitle = await page.title();
  expect(pageTitle).toBe(testTitle);
});

test('Should send a span and an error event for a faulty generateMetadata() function invocation', async ({ page }) => {
  const testTitle = 'should-emit-error';
  const httpTarget = `/generation-functions?metadataTitle=${testTitle}&shouldThrowInGenerateMetadata=1`;

  const spanPromise = waitForStreamedSpan('nextjs-16', isSegment);

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateMetadata Error';
  });

  await page.goto(httpTarget);

  const errorEvent = await errorEventPromise;
  expect(await spanPromise).toBeDefined();

  expect(errorEvent.transaction).toBe(expectedTransaction(errorEvent, 'Page.generateMetadata (/generation-functions)'));

  // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
  // asserted on the error event.
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Should send a span for a generateViewport() function invocation', async ({ page }) => {
  test.skip(isVinext, 'vinext emits no `generateViewport` span');

  const testTitle = 'floob';
  const httpTarget = `/generation-functions?viewportThemeColor=${testTitle}`;

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', SEGMENT_NAME);

  await page.goto(httpTarget);

  const spans = await spansPromise;
  const segmentSpan = spans.find(isSegment)!;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'generateViewport /generation-functions/page',
      status: 'ok',
      trace_id: segmentSpan.trace_id,
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto', type: 'string' },
      }),
    }),
  );
});

test('Should send a span and an error event for a faulty generateViewport() function invocation', async ({ page }) => {
  const testTitle = 'blargh';
  const httpTarget = `/generation-functions?viewportThemeColor=${testTitle}&shouldThrowInGenerateViewport=1`;

  const spanPromise = waitForStreamedSpan('nextjs-16', isSegment);

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateViewport Error';
  });

  await page.goto(httpTarget);

  expect(await spanPromise).toBeDefined();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.transaction).toBe(expectedTransaction(errorEvent, 'Page.generateViewport (/generation-functions)'));
});
