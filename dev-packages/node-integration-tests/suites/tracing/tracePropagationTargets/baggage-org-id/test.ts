import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';
import { supports } from '../../../../utils';

afterAll(() => {
  cleanupChildProcesses();
});

// Bun before 1.4 does not instrument outgoing `node:http` requests.
// See https://github.com/getsentry/sentry-javascript/issues/23881
describe.runIf(supports({ bunMin: '1.4.0' }))('baggage org_id', () => {
  test('should include explicitly set org_id in the baggage header', async () => {
    const runner = createRunner(__dirname, 'server.ts').start();

    const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
    expect(response).toBeDefined();

    const baggage = response?.test_data.baggage;
    expect(baggage).toContain('sentry-org_id=01234987');
  });

  test('should extract org_id from DSN host when not explicitly set', async () => {
    const runner = createRunner(__dirname, 'server-no-explicit-org-id.ts').start();

    const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
    expect(response).toBeDefined();

    const baggage = response?.test_data.baggage;
    expect(baggage).toContain('sentry-org_id=01234987');
  });

  test('should set undefined org_id when it cannot be extracted', async () => {
    const runner = createRunner(__dirname, 'server-no-org-id.ts').start();

    const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');
    expect(response).toBeDefined();

    const baggage = response?.test_data.baggage;
    expect(baggage).not.toContain('sentry-org_id');
  });
});
