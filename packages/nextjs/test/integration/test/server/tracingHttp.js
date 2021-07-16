const assert = require('assert');

const nock = require('nock');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/api/http`;

  nock('http://example.com')
    .get('/')
    .reply(200, 'ok');

  const capturedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: { 'http.status_code': '200' },
        },
      },
      spans: [
        {
          description: 'GET http://example.com/',
          op: 'request',
          status: 'ok',
          tags: { 'http.status_code': '200' },
        },
      ],
      transaction: 'GET /api/http',
      type: 'transaction',
      request: {
        url,
      },
    },
    argv,
    'tracingHttp',
  );

  await getAsync(url);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
