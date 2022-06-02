import * as path from 'path';

import { getAPIResponse, runServer } from '../../../../utils/index';
import { TestAPIResponse } from '../server';

test('Should assign `baggage` header which contains 3rd party trace baggage data to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'foo=bar,bar=baz',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'foo=bar,bar=baz,sentry-environment=prod,sentry-release=1.0',
    },
  });
});

test('Should assign `baggage` header which contains sentry trace baggage data to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'sentry-version=2.0.0,sentry-environment=myEnv',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-version=2.0.0,sentry-environment=myEnv',
    },
  });
});

test('Should assign `baggage` header which contains sentry and 3rd party trace baggage data to an outgoing request.', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await getAPIResponse(new URL(`${url}/express`), {
    baggage: 'sentry-version=2.0.0,sentry-environment=myEnv,dogs=great',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: expect.stringContaining('dogs=great,sentry-version=2.0.0,sentry-environment=myEnv'),
    },
  });
});
