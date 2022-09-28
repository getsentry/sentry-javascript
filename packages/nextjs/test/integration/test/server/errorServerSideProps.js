const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/withErrorServerSideProps`;

  const capturedRequest = interceptEventRequest(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'ServerSideProps Error',
          },
        ],
      },
      tags: {
        runtime: 'node',
      },
      request: {
        url,
        method: 'GET',
      },
    },
    argv,
    'errorServerSideProps',
  );

  const capturedTransactionRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
        },
      },
      transaction: '/withErrorServerSideProps',
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
    'errorServerSideProps',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
  assert.ok(capturedTransactionRequest.isDone(), 'Did not intercept expected transaction request');
};
