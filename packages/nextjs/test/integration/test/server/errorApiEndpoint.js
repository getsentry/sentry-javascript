const assert = require('assert');

const { getAsync, interceptEventRequest, sleep } = require('../utils');

module.exports = async ({ url }) => {
  const capturedRequest = interceptEventRequest({
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
  });

  await getAsync(`${url}/api/error`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
