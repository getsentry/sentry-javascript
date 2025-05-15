import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should include explicitly set org_id in the baggage header', async () => {
  const runner = createRunner(__dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage?.split(',').sort();

  expect(baggage).toContain('sentry-org_id=01234987');
});

test('should extract org_id from DSN host when not explicitly set', async () => {
  // This test requires a new server with different configuration
  const runner = createRunner(__dirname, 'server-no-explicit-org-id.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage?.split(',').sort();

  expect(baggage).toContain('sentry-org_id=01234987');
});
