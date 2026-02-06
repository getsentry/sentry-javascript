import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 22 })('light mode propagationSpanId', () => {
  test('getTraceData returns consistent span ID within a request', async () => {
    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ spanId1: string; spanId2: string }>(
      'get',
      '/test-propagation',
    );

    expect(response?.spanId1).toBeDefined();
    expect(response?.spanId2).toBeDefined();
    expect(response?.spanId1).toBe(response?.spanId2);
  });
});
