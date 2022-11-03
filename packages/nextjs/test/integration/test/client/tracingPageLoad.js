const { expectRequestCount, isTransactionRequest, expectTransaction } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  const requestPromise = page.waitForRequest(isTransactionRequest);
  await page.goto(`${url}/healthy`);
  await requestPromise;

  expectTransaction(requests.transactions[0], {
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  await expectRequestCount(requests, { transactions: 1 });
};
