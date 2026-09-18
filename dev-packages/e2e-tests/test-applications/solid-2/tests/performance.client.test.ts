import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('the pageload continues the server trace through the runtime’s carriers', async ({ page }) => {
  const isServer = (span: SerializedStreamedSpan): boolean =>
    span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/';
  // No router in this app, so the pageload keeps the SDK's default name; the path is an attribute.
  const isPageload = (span: SerializedStreamedSpan): boolean =>
    span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === '/';
  // Grouped by trace: the two only satisfy this together if the browser
  // continued the server's trace (other tests load '/' too).
  const spansPromise = collectStreamedSpans('solid-2', spans => spans.some(isServer) && spans.some(isPageload));

  await page.goto('/');

  const spans = await spansPromise;
  const server = spans.find(isServer)!;
  const pageload = spans.find(isPageload)!;
  // No middleware rewrote the document: the runtime emitted the <meta> pair
  // from the trace provider's answer, and Server-Timing on the response.
  expect(pageload.trace_id).toBe(server.trace_id);
  expect(pageload.parent_span_id).toBe(server.span_id);
});

test('a click is a root span with the server-function call it made as a child, joined by identity', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpans(
    'solid-2',
    spans =>
      spans.some(span => span.is_segment && getSpanOp(span) === 'ui.interaction.click') &&
      spans.some(span => getSpanOp(span) === 'function.solid.call'),
  );

  await page.goto('/');
  await page.locator('#callBtn').click();
  await expect(page.locator('#callResult')).toContainText('Kagoshima');

  const spans = await spansPromise;
  const interaction = spans.find(span => span.is_segment && getSpanOp(span) === 'ui.interaction.click')!;
  const call = spans.find(span => getSpanOp(span) === 'function.solid.call')!;

  expect(interaction.name).toBe('click on button#callBtn');
  expect(interaction.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.ui.solid.attribution', type: 'string' },
    'solid.interaction.type': { value: 'click', type: 'string' },
  });
  expect(call.parent_span_id).toBe(interaction.span_id);
  expect(call.trace_id).toBe(interaction.trace_id);
  expect(call.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.http.solid.call', type: 'string' },
    'solid.server_function.method': { value: 'POST', type: 'string' },
    'solid.server_function.outcome': { value: 'ok', type: 'string' },
    'solid.server_function.origin.kind': { value: 'interaction', type: 'string' },
  });
});
