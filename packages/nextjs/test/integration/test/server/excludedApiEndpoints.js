const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const regExpUrl = `${urlBase}/api/excludedEndpoints/excludedWithRegExp`;
  const stringUrl = `${urlBase}/api/excludedEndpoints/excludedWithString`;

  const capturedRegExpErrorRequest = interceptEventRequest(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'API Error',
          },
        ],
      },
      tags: {
        runtime: 'node',
      },
      request: {
        url: regExpUrl,
        method: 'GET',
      },
      transaction: 'GET /api/excludedEndpoints/excludedWithRegExp',
    },
    argv,
    'excluded API endpoint via RegExp',
  );

  const capturedStringErrorRequest = interceptEventRequest(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'API Error',
          },
        ],
      },
      tags: {
        runtime: 'node',
      },
      request: {
        url: regExpUrl,
        method: 'GET',
      },
      transaction: 'GET /api/excludedEndpoints/excludedWithString',
    },
    argv,
    'excluded API endpoint via String',
  );

  await Promise.all([getAsync(regExpUrl), getAsync(stringUrl)]);
  await sleep(250);

  assert.ok(
    !capturedRegExpErrorRequest.isDone(),
    'Did intercept error request even though route should be excluded (RegExp)',
  );
  assert.ok(
    !capturedStringErrorRequest.isDone(),
    'Did intercept error request even though route should be excluded (String)',
  );
};
