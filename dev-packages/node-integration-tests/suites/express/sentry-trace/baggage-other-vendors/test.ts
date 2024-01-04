import * as path from 'path';

import { TestEnv } from '../../../../utils/index';
import type { TestAPIResponse } from '../server';

test('should merge `baggage` header of a third party vendor with the Sentry DSC baggage items', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    'sentry-trace': '',
    baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: ['other=vendor,foo=bar,third=party', 'sentry-release=2.0.0,sentry-environment=myEnv'],
    },
  });
});
