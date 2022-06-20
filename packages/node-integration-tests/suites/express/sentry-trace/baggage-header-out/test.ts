import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('should attach a `baggage` header to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`))) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringMatching('sentry-environment=prod,sentry-release=1.0'),
    },
  });
});
