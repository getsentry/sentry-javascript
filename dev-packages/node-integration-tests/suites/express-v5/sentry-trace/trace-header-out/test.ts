import { TRACEPARENT_REGEXP } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from '../server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should attach a `sentry-trace` header to an outgoing request.', async () => {
  const runner = createRunner(__dirname, '..', 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();
  expect(response).toMatchObject({
    test_data: {
      host: 'somewhere.not.sentry',
      'sentry-trace': expect.any(String),
    },
  });

  expect(TRACEPARENT_REGEXP.test(response?.test_data['sentry-trace'] || '')).toBe(true);
});
