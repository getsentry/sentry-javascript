import { TRACEPARENT_REGEXP } from '@sentry/utils';

import { getAPIResponse, runServer } from '../../../../utils/index';
import path = require('path');

test('should attach a `sentry-trace` header to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = await getAPIResponse(new URL(`${url}/express`));

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      'sentry-trace': expect.any(String),
    },
  });

  expect(TRACEPARENT_REGEXP.test(response.test_data['sentry-trace'])).toBe(true);
});
