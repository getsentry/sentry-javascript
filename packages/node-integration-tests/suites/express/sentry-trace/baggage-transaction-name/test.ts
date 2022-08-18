import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('Includes transaction in baggage if the transaction name is parameterized', async () => {
  const { url, server } = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse({ url: `${url}/express`, server })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('sentry-transaction=GET%20%2Ftest%2Fexpress'),
    },
  });
});
