const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const url = `${urlBase}/withServerSideProps`;

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
        url,
        method: 'GET',
      },
    },
    argv,
    'errorServerSideProps',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
