import * as path from 'path';

import { TestEnv } from '../../../../utils/index';
import type { TestAPIResponse } from '../server';

test('Includes transaction in baggage if the transaction name is parameterized', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`)) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('sentry-transaction=GET%20%2Ftest%2Fexpress'),
    },
  });
});
