import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-17', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('/');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageloadSpanPromise = waitForStreamedSpan('react-17', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-17', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect(navigationSpan.name).toBe('/user/:id');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/), type: 'string' },
  });
});

test('sends an INP span', async ({ page }) => {
  const inpSpanPromise = waitForStreamedSpan('react-17', span => {
    return getSpanOp(span) === 'ui.interaction.click';
  });

  await page.goto(`/`);

  await page.click('#exception-button');

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const inpSpan = await inpSpanPromise;

  const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
  expect(inpValue).toBeGreaterThan(0);

  const pageloadSpanId = inpSpan.parent_span_id;

  expect(inpSpan).toEqual(
    expect.objectContaining({
      name: 'body > div#root > input#exception-button[type="button"]',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: false,
      status: 'ok',
    }),
  );
  expect(inpSpan.end_timestamp).toBeGreaterThan(inpSpan.start_timestamp);

  // `client.address` and replay/user attributes are added by the server or vary by run, so we assert
  // the stable subset rather than the exhaustive attribute set.
  expect(inpSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': { value: 'ui.interaction.click', type: 'string' },
      'sentry.origin': { value: 'auto.http.browser.inp', type: 'string' },
      'sentry.exclusive_time': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
      'browser.web_vital.inp.value': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
      'sentry.transaction': { value: '/', type: 'string' },
      'sentry.segment.name': { value: '/', type: 'string' },
      'sentry.segment.id': { value: pageloadSpanId, type: 'string' },
      'sentry.pageload.span_id': { value: pageloadSpanId, type: 'string' },
      'sentry.trace_lifecycle': { value: 'stream', type: 'string' },
      'sentry.release': { value: 'e2e-test', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },
    }),
  );
});
