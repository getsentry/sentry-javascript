import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('parentSampleRate propagation with no tracing enabled', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should propagate an incoming sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });

  test('should not propagate a sample rate for root traces', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).not.toMatch(/sentry-sample_rate/);
  });
});
