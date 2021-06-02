const { expectRequestCount, isTransactionRequest, expectTransaction } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await page.goto(`${url}/healthy`);
  await page.waitForRequest(isTransactionRequest);

  expectTransaction(requests.transactions[0], {
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  await expectRequestCount(requests, { transactions: 1 });
};
