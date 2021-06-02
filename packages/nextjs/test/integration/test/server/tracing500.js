const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url, argv }) => {
  const capturedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          tags: { 'http.status_code': '500' },
        },
      },
      transaction: 'GET /api/broken',
      type: 'transaction',
      request: {
        url: '/api/broken',
      },
    },
    argv,
  );

  await getAsync(`${url}/api/broken`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
