const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const unwrappedRoute = '/api/wrapApiHandlerWithSentry/unwrapped/cjsExport';
  const interceptedUnwrappedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: { 'http.status_code': '200' },
        },
      },
      transaction: `GET ${unwrappedRoute}`,
      type: 'transaction',
      request: {
        url: `${urlBase}${unwrappedRoute}`,
      },
    },
    argv,
    'unwrapped CJS route',
  );
  const responseUnwrapped = await getAsync(`${urlBase}${unwrappedRoute}`);
  assert.equal(responseUnwrapped, '{"success":true}');

  const wrappedRoute = '/api/wrapApiHandlerWithSentry/wrapped/cjsExport';
  const interceptedWrappedRequest = interceptTracingRequest(
    {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          tags: { 'http.status_code': '200' },
        },
      },
      transaction: `GET ${wrappedRoute}`,
      type: 'transaction',
      request: {
        url: `${urlBase}${wrappedRoute}`,
      },
    },
    argv,
    'wrapped CJS route',
  );
  const responseWrapped = await getAsync(`${urlBase}${wrappedRoute}`);
  assert.equal(responseWrapped, '{"success":true}');

  await sleep(250);

  assert.ok(interceptedUnwrappedRequest.isDone(), 'Did not intercept unwrapped request');
  assert.ok(interceptedWrappedRequest.isDone(), 'Did not intercept wrapped request');
};
