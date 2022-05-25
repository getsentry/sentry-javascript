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
      // TODO this is currently still empty but eventually it should contain sentry data
      baggage: expect.stringMatching(''),
    },
  });
});
