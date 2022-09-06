const { sleep } = require('../utils/common');
const { expectRequestCount, isTransactionRequest, expectTransaction } = require('../utils/client');

module.exports = async ({ page, url, requests }) => {
  await page.goto(`${url}/42/withInitialProps/`);
  await page.waitForRequest(isTransactionRequest);

  expectTransaction(requests.transactions[0], {
    transaction: '/[id]/withInitialProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  await sleep(250);

  await page.click('a#server-side-props-page');
  await page.waitForRequest(isTransactionRequest);

  expectTransaction(requests.transactions[1], {
    transaction: '/[id]/withServerSideProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'navigation',
        tags: {
          from: '/[id]/withInitialProps',
        },
      },
    },
  });

  await sleep(250);

  await page.click('a#initial-props-page');
  await page.waitForRequest(isTransactionRequest);

  expectTransaction(requests.transactions[2], {
    transaction: '/[id]/withInitialProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'navigation',
        tags: {
          from: '/[id]/withServerSideProps',
        },
      },
    },
  });

  await expectRequestCount(requests, { transactions: 3 });
};
