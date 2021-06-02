const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url, argv }) => {
  const capturedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'not_found',
          tags: { 'http.status_code': '404' },
        },
      },
      transaction: 'GET /404',
      type: 'transaction',
      request: {
        url: '/api/missing',
      },
    },
    argv,
  );

  await getAsync(`${url}/api/missing`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
