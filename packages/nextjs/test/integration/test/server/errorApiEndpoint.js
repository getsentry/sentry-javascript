const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/api/error`;

  const capturedErrorRequest = interceptEventRequest(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'API Error',
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
      transaction: 'GET /api/error',
    },
    argv,
    'errorApiEndpoint',
  );

  const capturedTransactionRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          tags: { 'http.status_code': '500' },
        },
      },
      transaction: 'GET /api/error',
      type: 'transaction',
      request: {
        url,
      },
    },
    argv,
    'errorApiEndpoint',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedErrorRequest.isDone(), 'Did not intercept expected error request');
  assert.ok(capturedTransactionRequest.isDone(), 'Did not intercept expected transaction request');
};
