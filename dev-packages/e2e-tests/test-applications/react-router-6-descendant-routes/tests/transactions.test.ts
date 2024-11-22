import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/projects/123/views/234`);

  const rootSpan = await transactionPromise;

  console.debug('rootSpan', rootSpan);

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
      },
    },
    transaction: '/projects/:projectId/views/:viewId',
    transaction_info: {
      source: 'route',
    },
  });
});

// test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
//   page.on('console', msg => console.log(msg.text()));

//   const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
//     return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
//   });

//   const navigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
//     return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
//   });

//   await page.goto(`/`);
//   await pageloadTxnPromise;

//   const linkElement = page.locator('id=navigation');

//   const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

//   expect(navigationTxn).toMatchObject({
//     contexts: {
//       trace: {
//         op: 'navigation',
//         origin: 'auto.navigation.react.reactrouter_v6',
//       },
//     },
//     transaction: '/user/:id',
//     transaction_info: {
//       source: 'route',
//     },
//   });
// });
