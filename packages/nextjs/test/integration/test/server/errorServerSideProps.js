const assert = require('assert');

const { getAsync, interceptEventRequest, sleep } = require('../utils');

module.exports = async ({ url }) => {
  const capturedRequest = interceptEventRequest({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'ServerSideProps Error',
        },
      ],
    },
    tags: {
      runtime: 'node',
    },
    request: {
      url: '/withServerSideProps',
      method: 'GET',
    },
  });

  await getAsync(`${url}/withServerSideProps`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
