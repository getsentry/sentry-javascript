import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('the pageload continues the server trace through the runtime’s carriers', async ({ page }) => {
  const isServer = (span: SerializedStreamedSpan): boolean =>
    span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/';
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

test('the pageload is named by the route the document arrived on, from the router’s declaration', async ({ page }) => {
  const isPageload = (span: SerializedStreamedSpan): boolean =>
    span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === '/users/6';
  const spansPromise = collectStreamedSpans('solid-2', spans => spans.some(isPageload));

  await page.goto('/users/6');
  await expect(page.locator('#user')).toContainText('Kagoshima');

  const pageload = (await spansPromise).find(isPageload)!;
  // The route pattern, not the URL: one name per route in Performance.
  expect(pageload.name).toBe('/users/:id');
  expect(pageload.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/users/:id', type: 'string' },
    'url.path.parameter.id': { value: '6', type: 'string' },
  });
});

const isNavigation = (span: SerializedStreamedSpan): boolean => span.is_segment && getSpanOp(span) === 'navigation';
const isCall = (span: SerializedStreamedSpan): boolean => getSpanOp(span) === 'function.solid.call';

/** What every navigation to `/users/6` from `/` paints, however it was performed. */
function expectRouteNavigation(spans: SerializedStreamedSpan[]): SerializedStreamedSpan {
  const navigation = spans.find(isNavigation)!;
  expect(navigation.name).toBe('/users/:id');
  expect(navigation.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.navigation.solid', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/users/:id', type: 'string' },
    'url.path': { value: '/users/6', type: 'string' },
    'url.path.parameter.id': { value: '6', type: 'string' },
    'solid.navigation.to': { value: '/users/6', type: 'string' },
    'solid.navigation.from': { value: '/', type: 'string' },
    'solid.navigation.outcome': { value: 'committed', type: 'string' },
  });
  // Ended where the runtime settled it (the data landed, the transition
  // committed), not at the browser SDK's idle timeout.
  expect(navigation.end_timestamp - navigation.start_timestamp).toBeLessThan(1);
  // A root in the trace the navigation opened.
  expect(navigation.parent_span_id).toBeUndefined();
  // The one navigation span: nothing painted twice.
  expect(spans.filter(span => getSpanOp(span) === 'navigation')).toHaveLength(1);
  // The server-function call the route's data made is the navigation's
  // child — joined by the frame the engine recorded on the call, not by time.
  const call = spans.find(isCall)!;
  expect(call.parent_span_id).toBe(navigation.span_id);
  expect(call.trace_id).toBe(navigation.trace_id);
  expect(call.attributes['solid.server_function.origin.kind']).toEqual({ value: 'navigation', type: 'string' });
  return navigation;
}

test('a click that navigates: the navigation span is the browser’s, named by the route; the click links to it', async ({
  page,
}) => {
  const isClick = (span: SerializedStreamedSpan): boolean =>
    span.is_segment && getSpanOp(span) === 'ui.interaction.click' && span.name === 'click on button#userBtn';
  const spansPromise = collectStreamedSpans(
    'solid-2',
    spans => spans.some(isNavigation) && spans.some(isClick) && spans.some(isCall),
  );

  await page.goto('/');
  await page.locator('#userBtn').click();
  await expect(page.locator('#user')).toContainText('Kagoshima');

  const spans = await spansPromise;
  const navigation = expectRouteNavigation(spans);
  const click = spans.find(isClick)!;

  // The click that performed the navigation is in the trace it opened and
  // links to it — the causal fact, no guessed parent.
  expect(click.trace_id).toBe(navigation.trace_id);
  expect(click.links).toEqual([
    expect.objectContaining({
      span_id: navigation.span_id,
      attributes: expect.objectContaining({ 'solid.link': { value: 'navigation', type: 'string' } }),
    }),
  ]);
});

test('an anchor that navigates: the same navigation span, with the route’s call as its child', async ({ page }) => {
  const spansPromise = collectStreamedSpans('solid-2', spans => spans.some(isNavigation) && spans.some(isCall));

  await page.goto('/');
  await page.locator('#userLink').click();
  await expect(page.locator('#user')).toContainText('Kagoshima');

  // The router handles anchors in a document-level listener, outside the
  // runtime's interaction frame: the navigation records no interaction, so
  // there is no click span to link — the navigation and its call stand alone.
  const spans = await spansPromise;
  expectRouteNavigation(spans);
  expect(spans.filter(span => getSpanOp(span) === 'ui.interaction.click')).toHaveLength(0);
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
