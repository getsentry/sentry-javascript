import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Sends an exception to Sentry after a pageload and attaches the transaction info', async ({ page }) => {
  const errorPromise = waitForError('standard-frontend-react', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);

  const [, error] = await Promise.all([page.locator('#exception-button').click(), errorPromise]);

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'I am an error!',
          mechanism: {
            type: 'generic',
            handled: true, // called via captureException, this makes sense
          },
        },
      ],
    },
    transaction: '/',
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.react.reactrouter_v6',
          'sentry.op': 'pageload',
          'sentry.sample_rate': 1,
        },
        op: 'pageload',
        span_id: expect.any(String),
        trace_id: expect.any(String),
        origin: 'auto.pageload.react.reactrouter_v6',
      },
    },
  });
});

test('Sends an exception to Sentry after a navigation and attaches the transaction info', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('standard-frontend-react', async txnEvent => {
    return txnEvent.type === 'transaction' && txnEvent.contexts?.trace?.op === 'pageload';
  });

  const errorPromise = waitForError('standard-frontend-react', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);

  await pageloadTxnPromise;

  await page.locator('#navigation').click();

  const [, error] = await Promise.all([page.locator('#userErrorBtn').click(), errorPromise]);

  console.log(JSON.stringify(error, null, 2));
  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'User page error',
          mechanism: {
            type: 'instrument',
            handled: false,
          },
        },
      ],
    },
    transaction: '/user/:id',
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.react.reactrouter_v6',
          'sentry.op': 'navigation',
          'sentry.sample_rate': 1,
        },
        op: 'navigation',
        span_id: expect.any(String),
        trace_id: expect.any(String),
        origin: 'auto.navigation.react.reactrouter_v6',
      },
    },
  });
});
