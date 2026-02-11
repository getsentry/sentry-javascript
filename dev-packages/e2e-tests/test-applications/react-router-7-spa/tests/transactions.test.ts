import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-spa', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v7',
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
  const pageloadTxnPromise = waitForTransaction('react-router-7-spa', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-7-spa', async transactionEvent => {
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
        origin: 'auto.navigation.react.reactrouter_v7',
      },
    },
    transaction: '/user/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends an INP span', async ({ page }) => {
  const inpSpanPromise = waitForEnvelopeItem('react-router-7-spa', item => {
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
