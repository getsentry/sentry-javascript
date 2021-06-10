const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest } = require('../utils/server');

module.exports = async ({ url, argv }) => {
  const capturedRequest = interceptEventRequest(
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
        url: `${url}/api/error`,
        method: 'GET',
      },
      transaction: 'GET /api/error',
    },
    argv,
  );

  await getAsync(`${url}/api/error`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
