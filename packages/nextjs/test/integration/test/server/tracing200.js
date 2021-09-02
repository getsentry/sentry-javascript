const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/api/users`;

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
        url,
      },
    },
    argv,
    'tracing200',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
