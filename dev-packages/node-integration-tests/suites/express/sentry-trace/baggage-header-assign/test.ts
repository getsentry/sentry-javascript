import { parseBaggageHeader } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

test('Should overwrite baggage if the incoming request already has Sentry baggage data but no sentry-trace', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });

  expect(response).toBeDefined();
  expect(response).not.toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});

test('Should propagate sentry trace baggage data from an incoming to an outgoing request.', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,dogs=great,sentry-sample_rand=0.42',
    },
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,sentry-sample_rand=0.42',
    },
  });
});

test('Should not propagate baggage data from an incoming to an outgoing request if sentry-trace is faulty.', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      'sentry-trace': '',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,dogs=great',
    },
  });

  expect(response).toBeDefined();
  expect(response).not.toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
    },
  });
});

test('Should not propagate baggage if sentry-trace header is present in incoming request but no baggage header', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
    },
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
});

test('Should not propagate baggage and ignore original 3rd party baggage entries if sentry-trace header is present', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'foo=bar',
    },
  });

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
    },
  });
});

test('Should populate and propagate sentry baggage if sentry-trace header does not exist', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();

  const parsedBaggage = parseBaggageHeader(response?.test_data.baggage);

  expect(response?.test_data.host).toBe('somewhere.not.sentry');
  expect(parsedBaggage).toStrictEqual({
    'sentry-environment': 'prod',
    'sentry-release': '1.0',
    'sentry-public_key': 'public',
    // TraceId changes, hence we only expect that the string contains the traceid key
    'sentry-trace_id': expect.stringMatching(/\S*/),
    'sentry-sample_rand': expect.stringMatching(/\S*/),
    'sentry-sample_rate': '1',
    'sentry-sampled': 'true',
    'sentry-transaction': 'GET /test/express',
  });
});

test('Should populate Sentry and ignore 3rd party content if sentry-trace header does not exist', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
    headers: {
      baggage: 'foo=bar,bar=baz',
    },
  });

  expect(response).toBeDefined();
  expect(response?.test_data.host).toBe('somewhere.not.sentry');

  const parsedBaggage = parseBaggageHeader(response?.test_data.baggage);
  expect(parsedBaggage).toStrictEqual({
    'sentry-environment': 'prod',
    'sentry-release': '1.0',
    'sentry-public_key': 'public',
    // TraceId changes, hence we only expect that the string contains the traceid key
    'sentry-trace_id': expect.stringMatching(/\S*/),
    'sentry-sample_rand': expect.stringMatching(/\S*/),
    'sentry-sample_rate': '1',
    'sentry-sampled': 'true',
    'sentry-transaction': 'GET /test/express',
  });
});
