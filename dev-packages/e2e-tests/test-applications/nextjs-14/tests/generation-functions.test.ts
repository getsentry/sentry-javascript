import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

function collectSpansForTarget(httpTarget: string) {
  return collectStreamedSpansUntilSegment('nextjs-14', span => span.attributes['http.target']?.value === httpTarget);
}

test('Should emit a span for a generateMetadata() function invocation', async ({ page }) => {
  const testTitle = 'should-emit-span';
  const httpTarget = `/generation-functions?metadataTitle=${testTitle}`;

  const spansPromise = collectSpansForTarget(httpTarget);

  await page.goto(httpTarget);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.attributes['http.target']?.value === httpTarget)!;

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

  const spanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.is_segment && span.attributes['http.target']?.value === httpTarget;
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return (
      errorEvent?.exception?.values?.[0]?.value === 'generateMetadata Error' &&
      errorEvent.transaction === 'Page.generateMetadata (/generation-functions)'
    );
  });

  await page.goto(httpTarget);

  const errorEvent = await errorEventPromise;
  expect(await spanPromise).toBeDefined();

  // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
  // asserted on the error event; the span-side assertions were dropped in the streaming port.
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Should send a span for a generateViewport() function invocation', async ({ page }) => {
  const testTitle = 'floob';
  const httpTarget = `/generation-functions?viewportThemeColor=${testTitle}`;

  const spansPromise = collectSpansForTarget(httpTarget);

  await page.goto(httpTarget);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.attributes['http.target']?.value === httpTarget)!;

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

  const spanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.is_segment && span.attributes['http.target']?.value === httpTarget;
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateViewport Error';
  });

  await page.goto(httpTarget);

  expect(await spanPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.transaction).toBe('Page.generateViewport (/generation-functions)');
});
