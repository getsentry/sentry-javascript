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
        'sentry-environment=prod,sentry-release=1.0,sentry-user_segment=SegmentA' +
        ',sentry-public_key=public,sentry-trace_id=86f39e84263a4de99c326acab3bfe3bd,sentry-sample_rate=1',
    },
  });
});

test('Does not include transaction name if transaction source is not set', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '.')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`))) as TestAPIResponse;
  const baggageString = response.test_data.baggage;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
  expect(baggageString).not.toContain('sentry-user_id=');
  expect(baggageString).not.toContain('sentry-transaction=');
});
