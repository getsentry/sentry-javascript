const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/api/broken`;
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
        url,
      },
    },
    argv,
    'tracing500',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
