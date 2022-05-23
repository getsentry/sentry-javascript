import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('Should assign `baggage` header which contains 3rd party trace baggage data of an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'foo=bar,bar=baz',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('foo=bar,bar=baz'),
    },
  });
});

test('Should assign `baggage` header which contains sentry trace baggage data of an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'sentry-version=1.0.0,sentry-environment=production',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('sentry-version=1.0.0,sentry-environment=production'),
    },
  });
});

test('Should assign `baggage` header which contains sentry and 3rd party trace baggage data of an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'sentry-version=1.0.0,sentry-environment=production,dogs=great',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('dogs=great,sentry-version=1.0.0,sentry-environment=production'),
    },
  });
});
