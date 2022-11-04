const { expectRequestCount, isTransactionRequest, expectTransaction } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  const requestPromise = page.waitForRequest(isTransactionRequest);
  await page.goto(`${url}/users/102`);
  await requestPromise;

  expectTransaction(requests.transactions[0], {
    transaction: '/users/[id]',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  await expectRequestCount(requests, { transactions: 1 });
};
