const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/239/withInitialProps`;

  const capturedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'nextjs.data.server',
        },
      },
      transaction: '/[id]/withInitialProps',
      transaction_info: {
        source: 'route',
        changes: [],
        propagations: 0,
      },
      type: 'transaction',
      request: {
        url,
      },
    },
    argv,
    'tracingGetInitialProps',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
