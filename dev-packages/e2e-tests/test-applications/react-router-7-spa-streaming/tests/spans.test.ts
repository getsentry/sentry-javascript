import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
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

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
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
  const inpSpanPromise = waitForStreamedSpan('react-router-7-spa-streaming', span => {
    return getSpanOp(span) === 'ui.interaction.click';
  });

  await page.goto(`/`);

  await page.click('#exception-button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const inpSpan = await inpSpanPromise;

  expect(inpSpan.name).toBe('body > div#root > input#exception-button[type="button"]');
  expect(inpSpan.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(inpSpan.span_id).toMatch(/[a-f0-9]{16}/);
  expect(inpSpan.end_timestamp).toBeGreaterThan(inpSpan.start_timestamp);
  expect(inpSpan.attributes?.['sentry.op']?.value).toBe('ui.interaction.click');
  expect(inpSpan.attributes?.['sentry.origin']?.value).toBe('auto.http.browser.inp');
  expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toEqual(expect.any(Number));
});
