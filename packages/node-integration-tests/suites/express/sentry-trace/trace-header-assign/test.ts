import { TRACEPARENT_REGEXP } from '@sentry/utils';
import * as path from 'path';

import { TestEnv } from '../../../../utils/index';
import type { TestAPIResponse } from '../server';

test('Should assign `sentry-trace` header which sets parent trace id of an outgoing request.', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      'sentry-trace': expect.stringContaining('12312012123120121231201212312012-'),
    },
  });

  expect(TRACEPARENT_REGEXP.test(response.test_data['sentry-trace'])).toBe(true);
});
