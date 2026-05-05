import { expect, test } from '@playwright/test';
import { getSpanOp, waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-spa-streaming', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.status).toBe('ok');
  expect(span.attributes?.['sentry.origin']?.value).toBe('auto.pageload.react.reactrouter_v7');
  expect(span.attributes?.['sentry.source']?.value).toBe('route');
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-7-spa-streaming', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-7-spa-streaming', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(navigationSpan.status).toBe('ok');
  expect(navigationSpan.attributes?.['sentry.origin']?.value).toBe('auto.navigation.react.reactrouter_v7');
  expect(navigationSpan.attributes?.['sentry.source']?.value).toBe('route');
});

test('sends an INP span', async ({ page }) => {
  const inpSpanPromise = waitForEnvelopeItem('react-router-7-spa-streaming', item => {
    return item[0].type === 'span';
  });

  await page.goto(`/`);

  await page.click('#exception-button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan = await inpSpanPromise;

  expect(inpSpan[1]).toEqual({
    data: {
      'sentry.origin': 'auto.http.browser.inp',
      'sentry.op': 'ui.interaction.click',
      release: 'e2e-test',
      environment: 'qa',
      transaction: '/',
      'sentry.exclusive_time': expect.any(Number),
      replay_id: expect.any(String),
      'user_agent.original': expect.stringContaining('Chrome'),
      'client.address': '{{auto}}',
    },
    description: 'body > div#root > input#exception-button[type="button"]',
    op: 'ui.interaction.click',
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    origin: 'auto.http.browser.inp',
    exclusive_time: expect.any(Number),
    measurements: { inp: { unit: 'millisecond', value: expect.any(Number) } },
    segment_id: expect.any(String),
  });
});
