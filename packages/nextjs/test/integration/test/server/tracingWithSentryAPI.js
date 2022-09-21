const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const urls = {
    // testName: [url, route]
    unwrappedNoParamURL: [`/api/withSentryAPI/unwrapped/noParams`, '/api/withSentryAPI/unwrapped/noParams'],
    unwrappedDynamicURL: [`/api/withSentryAPI/unwrapped/dog`, '/api/withSentryAPI/unwrapped/[animal]'],
    unwrappedCatchAllURL: [`/api/withSentryAPI/unwrapped/dog/facts`, '/api/withSentryAPI/unwrapped/[...pathParts]'],
    wrappedNoParamURL: [`/api/withSentryAPI/wrapped/noParams`, '/api/withSentryAPI/wrapped/noParams'],
    wrappedDynamicURL: [`/api/withSentryAPI/wrapped/dog`, '/api/withSentryAPI/wrapped/[animal]'],
    wrappedCatchAllURL: [`/api/withSentryAPI/wrapped/dog/facts`, '/api/withSentryAPI/wrapped/[...pathParts]'],
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
