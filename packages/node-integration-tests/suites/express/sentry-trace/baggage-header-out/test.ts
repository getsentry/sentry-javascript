import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('should attach a `baggage` header to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`))) as TestAPIResponse;

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

test('Does not include user_id in baggage if sendDefaultPii is not set', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`))) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.not.stringContaining('sentry-user_id'),
    },
  });
});
