const { expectRequestCount, isTransactionRequest, expectTransaction } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  if (Number(process.env.NEXTJS_VERSION) < 13 || Number(process.env.NODE_MAJOR) < 16) {
    // Next.js versions < 13 don't support the app directory and the app dir requires Node v16.8.0 or later.
    return;
  }

  const requestPromise = page.waitForRequest(isTransactionRequest);
  await page.goto(`${url}/servercomponent`);
  await requestPromise;

  expectTransaction(requests.transactions[0], {
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
    transaction: '/servercomponent',
  });

  await expectRequestCount(requests, { transactions: 1 });
};
