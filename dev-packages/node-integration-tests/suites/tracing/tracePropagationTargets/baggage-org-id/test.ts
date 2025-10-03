import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

test('should include explicitly set org_id in the baggage header', async ({ signal }) => {
  const runner = createRunner({ signal }, __dirname, 'server.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage;
  expect(baggage).toContain('sentry-org_id=01234987');
});

test('should extract org_id from DSN host when not explicitly set', async ({ signal }) => {
  const runner = createRunner({ signal }, __dirname, 'server-no-explicit-org-id.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage;
  expect(baggage).toContain('sentry-org_id=01234987');
});

test('should set undefined org_id when it cannot be extracted', async ({ signal }) => {
  const runner = createRunner({ signal }, __dirname, 'server-no-org-id.ts').start();

  const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
  expect(response).toBeDefined();

  const baggage = response?.test_data.baggage;
  expect(baggage).not.toContain('sentry-org_id');
});
