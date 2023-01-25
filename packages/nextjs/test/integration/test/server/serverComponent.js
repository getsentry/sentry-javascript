const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  if (Number(process.env.NEXTJS_VERSION) < 13 || Number(process.env.NODE_MAJOR) < 16) {
    // Next.js versions < 13 don't support the app directory and the app dir requires Node v16.8.0 or later.
    return;
  }

  const url = `${urlBase}/servercomponent`;

  const capturedRequest = interceptEventRequest(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'I am an Error captured inside a server component',
          },
        ],
      },
    },
    argv,
    'servercomponentCapturedException',
  );

  await getAsync(url);
  await sleep(250);

  assert.ok(capturedRequest.isDone(), 'Did not intercept expected request');
};
