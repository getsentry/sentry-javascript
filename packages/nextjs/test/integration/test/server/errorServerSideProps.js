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
    },
    argv,
  );

  await getAsync(`${url}/withServerSideProps`);
  await sleep(100);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
