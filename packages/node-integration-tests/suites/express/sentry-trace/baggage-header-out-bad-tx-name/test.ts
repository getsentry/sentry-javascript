import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('Does not include transaction name if transaction source is not set', async () => {
  const { url, server, scope } = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse({ url: `${url}/express`, server, scope })) as TestAPIResponse;
  const baggageString = response.test_data.baggage;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
  expect(baggageString).not.toContain('sentry-transaction=');
});
