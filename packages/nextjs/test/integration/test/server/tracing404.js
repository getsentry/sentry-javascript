const assert = require('assert');

const { getAsync, sleep, interceptTracingRequest } = require('../utils');

module.exports = async ({ url }) => {
  const capturedRequest = interceptTracingRequest({
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
  });

  await getAsync(`${url}/api/missing`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
