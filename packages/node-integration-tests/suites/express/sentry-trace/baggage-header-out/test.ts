import * as path from 'path';

import { TestEnv } from '../../../../utils/index';
import type { TestAPIResponse } from '../server';

test('should attach a `baggage` header to an outgoing request.', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`)) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage:
        'sentry-environment=prod,sentry-release=1.0,sentry-transaction=GET%20%2Ftest%2Fexpress,sentry-user_segment=SegmentA' +
        ',sentry-public_key=public,sentry-trace_id=86f39e84263a4de99c326acab3bfe3bd,sentry-sample_rate=1',
    },
  });
});
