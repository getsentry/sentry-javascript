import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { CODE_FILE_PATH, SENTRY_DESCRIPTION, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';

function isServerFnSegment(span: Parameters<typeof getSpanOp>[0]): boolean {
  return (
    !!span.is_segment &&
    getSpanOp(span) === 'http.server' &&
    String(span.attributes['url.path']?.value ?? '').startsWith('/_serverFn')
  );
}

test('Sends a server function span with auto-instrumentation', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'tanstackstart-react',
    spans =>
      spans.some(isServerFnSegment) &&
      spans.some(
        span =>
          span.name === 'testLog' && span.attributes['sentry.origin']?.value === 'auto.function.tanstackstart.server',
      ),
  );

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function', { exact: true })).toBeVisible();

  await page.getByText('Call server function', { exact: true }).click();

  const spans = await spansPromise;

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'testLog',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.function.tanstackstart.server' },
          'sentry.description': { type: 'string', value: 'GET /_serverFn/testLog' },
          [CODE_FILE_PATH]: { type: 'string', value: 'src/routes/test-serverFn.tsx' },
        }),
      }),
    ]),
  );
});

test('Sends a server function span for a nested server function', async ({ page }) => {
  const isAutoSpan = (span: { name?: string; attributes: Record<string, { value?: unknown }> }, name: string) =>
    span.name === name && span.attributes[SENTRY_ORIGIN]?.value === 'auto.function.tanstackstart.server';

  const spansPromise = collectStreamedSpans(
    'tanstackstart-react',
    spans =>
      spans.some(isServerFnSegment) &&
      spans.some(span => isAutoSpan(span, 'testNestedLog')) &&
      spans.some(span => isAutoSpan(span, 'testLog')) &&
      spans.some(span => span.name === 'testNestedLog' && span.attributes[SENTRY_ORIGIN]?.value === 'manual'),
  );

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function nested')).toBeVisible();

  await page.getByText('Call server function nested').click();

  const spans = await spansPromise;

  const outerSpan = spans.find(span => isAutoSpan(span, 'testNestedLog'));
  const manualSpan = spans.find(
    span => span.name === 'testNestedLog' && span.attributes[SENTRY_ORIGIN]?.value === 'manual',
  );
  const nestedSpan = spans.find(span => isAutoSpan(span, 'testLog'));

  expect(outerSpan).toMatchObject({
    name: 'testNestedLog',
    status: 'ok',
    attributes: expect.objectContaining({
      [SENTRY_OP]: { type: 'string', value: FUNCTION },
      [SENTRY_DESCRIPTION]: { type: 'string', value: 'GET /_serverFn/testNestedLog' },
      [CODE_FILE_PATH]: { type: 'string', value: 'src/routes/test-serverFn.tsx' },
    }),
  });
  expect(manualSpan).toMatchObject({ status: 'ok', parent_span_id: outerSpan?.span_id });
  expect(nestedSpan).toMatchObject({
    name: 'testLog',
    status: 'ok',
    parent_span_id: manualSpan?.span_id,
    attributes: expect.objectContaining({
      [SENTRY_OP]: { type: 'string', value: FUNCTION },
      [SENTRY_DESCRIPTION]: { type: 'string', value: 'GET /_serverFn/testLog' },
    }),
  });

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'globalFunctionMiddleware',
        parent_span_id: outerSpan?.span_id,
        attributes: expect.objectContaining({
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.middleware.tanstackstart' },
        }),
      }),
    ]),
  );
});
