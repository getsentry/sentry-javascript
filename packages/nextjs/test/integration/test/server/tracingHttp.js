const assert = require('assert');

const nock = require('nock');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/api/http`;

  // this intercepts the outgoing request made by the route handler (which it makes in order to test span creation)
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
          op: 'http.client',
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

  // The `true` causes `getAsync` to rewrap `http.get` in next 12, since it will have been overwritten by the import of
  // `nock` above. See https://github.com/getsentry/sentry-javascript/pull/4619.
  // TODO: see note in `getAsync` about removing the boolean
  await getAsync(url, true);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
