import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import type { TestAPIResponse } from './server';

afterAll(() => {
  cleanupChildProcesses();
});

// This test requires Node.js 22+ because it depends on the 'http.client.request.created'
// diagnostic channel for baggage header propagation, which only exists since Node 22.12.0+ and 23.2.0+
conditionalTest({ min: 22 })('node >=22', () => {
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
