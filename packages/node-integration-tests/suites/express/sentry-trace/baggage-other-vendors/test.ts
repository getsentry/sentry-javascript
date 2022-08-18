import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('should merge `baggage` header of a third party vendor with the Sentry DSC baggage items', async () => {
  const { url, server } = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse(
    { url: `${url}/express`, server },
    {
      'sentry-trace': '',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  )) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'other=vendor,foo=bar,third=party,sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});
