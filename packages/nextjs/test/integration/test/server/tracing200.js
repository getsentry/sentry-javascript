const assert = require('assert');

const { getAsync, sleep, interceptTracingRequest } = require('../utils');

module.exports = async ({ url }) => {
  const capturedRequest = interceptTracingRequest({
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
  });

  await getAsync(`${url}/api/users`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
