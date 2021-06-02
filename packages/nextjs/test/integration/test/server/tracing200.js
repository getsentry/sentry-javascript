const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url, argv }) => {
  const capturedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: { 'http.status_code': '200' },
        },
      },
      transaction: 'GET /api/users',
      type: 'transaction',
      request: {
        url: '/api/users',
      },
    },
    argv,
  );

  await getAsync(`${url}/api/users`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
