import * as path from 'path';

import { TestEnv } from '../../../../utils/index';
import type { TestAPIResponse } from '../server';

test('Should not overwrite baggage if the incoming request already has Sentry baggage data.', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);
  const response = (await env.getAPIResponse(`${env.url}/express`, {
    baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});

test('Should propagate sentry trace baggage data from an incoming to an outgoing request.', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    'sentry-trace': '',
    baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,dogs=great',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});

test('Should not propagate baggage if sentry-trace header is present in incoming request but no baggage header', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    'sentry-trace': '',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
});

test('Should not propagate baggage and ignore original 3rd party baggage entries if sentry-trace header is present', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    'sentry-trace': '',
    baggage: 'foo=bar',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
});

test('Should populate and propagate sentry baggage if sentry-trace header does not exist', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {})) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      // TraceId changes, hence we only expect that the string contains the traceid key
      baggage: expect.stringContaining(
        'sentry-environment=prod,sentry-release=1.0,sentry-transaction=GET%20%2Ftest%2Fexpress,sentry-public_key=public,sentry-trace_id=',
      ),
    },
  });
});

test('Should populate Sentry and ignore 3rd party content if sentry-trace header does not exist', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const response = (await env.getAPIResponse(`${env.url}/express`, {
    baggage: 'foo=bar,bar=baz',
  })) as TestAPIResponse;

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      // TraceId changes, hence we only expect that the string contains the traceid key
      baggage: expect.stringContaining(
        'sentry-environment=prod,sentry-release=1.0,sentry-transaction=GET%20%2Ftest%2Fexpress,sentry-public_key=public,sentry-trace_id=',
      ),
    },
  });
});
