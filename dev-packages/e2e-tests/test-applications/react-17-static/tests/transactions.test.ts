import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-17-static', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/',
          'url.path': '/',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
        },
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageloadTxnPromise = waitForTransaction('react-17-static', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-17-static', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  const linkElement = page.locator('id=navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/user/:id',
          'url.path': '/user/5',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/),
        },
      },
    },
    transaction: '/user/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends an INP span', async ({ page }) => {
  const inpSpanPromise = waitForStreamedSpan('react-17-static', span => {
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
