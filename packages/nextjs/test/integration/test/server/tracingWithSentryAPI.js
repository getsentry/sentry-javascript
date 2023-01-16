const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const urls = {
    // testName: [url, route]
    unwrappedNoParamURL: [
      `/api/wrapApiHandlerWithSentry/unwrapped/noParams`,
      '/api/wrapApiHandlerWithSentry/unwrapped/noParams',
    ],
    unwrappedDynamicURL: [
      `/api/wrapApiHandlerWithSentry/unwrapped/dog`,
      '/api/wrapApiHandlerWithSentry/unwrapped/[animal]',
    ],
    unwrappedCatchAllURL: [
      `/api/wrapApiHandlerWithSentry/unwrapped/dog/facts`,
      '/api/wrapApiHandlerWithSentry/unwrapped/[...pathParts]',
    ],
    wrappedNoParamURL: [
      `/api/wrapApiHandlerWithSentry/wrapped/noParams`,
      '/api/wrapApiHandlerWithSentry/wrapped/noParams',
    ],
    wrappedDynamicURL: [`/api/wrapApiHandlerWithSentry/wrapped/dog`, '/api/wrapApiHandlerWithSentry/wrapped/[animal]'],
    wrappedCatchAllURL: [
      `/api/wrapApiHandlerWithSentry/wrapped/dog/facts`,
      '/api/wrapApiHandlerWithSentry/wrapped/[...pathParts]',
    ],
  };

  const interceptedRequests = {};

  Object.entries(urls).forEach(([testName, [url, route]]) => {
    interceptedRequests[testName] = interceptTracingRequest(
      {
        contexts: {
          trace: {
            op: 'http.server',
            status: 'ok',
            tags: { 'http.status_code': '200' },
          },
        },
        transaction: `GET ${route}`,
        type: 'transaction',
        request: {
          url: `${urlBase}${url}`,
        },
      },
      argv,
      testName,
    );
  });

  // Wait until all requests have completed
  await Promise.all(Object.values(urls).map(([url]) => getAsync(`${urlBase}${url}`)));

  await sleep(250);

  const failingTests = Object.entries(interceptedRequests).reduce(
    (failures, [testName, request]) => (!request.isDone() ? failures.concat(testName) : failures),
    [],
  );

  assert.ok(
    failingTests.length === 0,
    `Did not intercept transaction request for the following tests: ${failingTests.join(', ')}.`,
  );
};
