import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForTransaction } from '@sentry-internal/test-utils';

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
        origin: 'auto.pageload.react.reactrouter',
        data: {
          'sentry.source': 'route',
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
        origin: 'auto.navigation.react.reactrouter',
        data: {
          'sentry.source': 'route',
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
  const inpSpanPromise = waitForStreamedSpan('react-router-7-spa', span => {
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
  expect(inpSpan.attributes['sentry.op']?.value).toBe('ui.interaction.click');
  expect(inpSpan.attributes['sentry.origin']?.value).toBe('auto.http.browser.inp');
  expect(inpSpan.attributes['sentry.exclusive_time']?.value).toEqual(expect.any(Number));
  expect(inpSpan.attributes['browser.web_vital.inp.value']?.value).toBeGreaterThan(0);
});
